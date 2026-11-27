const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ACCESS_LINK_SECRET = 'segredo-de-teste-com-mais-de-vinte-caracteres';
const trava = require('../lib/acesso-email');

const SID = 'cs_live_teste_trava_123';
const EMAIL = 'Compradora@Exemplo.invalid';

test('token do link só confere para a mesma compra e o mesmo e-mail', () => {
  const t = trava.tokenDoEmail(SID, EMAIL);
  assert.ok(t && t.length === 32);
  assert.ok(trava.tokenConfere(SID, 'compradora@exemplo.invalid', t), 'e-mail sem diferenciar maiúsculas');
  assert.equal(trava.tokenConfere(SID, 'outra@exemplo.invalid', t), false);
  assert.equal(trava.tokenConfere('cs_live_outra_compra', EMAIL, t), false);
  assert.equal(trava.tokenConfere(SID, EMAIL, ''), false);
  assert.match(trava.linkDeAcesso('https://x.invalid/', SID, EMAIL, 'slug-a'), /^https:\/\/x\.invalid\/acesso\?session_id=cs_live_teste_trava_123&slug=slug-a&t=/);
});

test('passe vale só para a compra, o e-mail e um aparelho registrado; expira e não aceita adulteração', () => {
  const agora = Date.now();
  const session = { id: SID, metadata: { acesso_aparelhos: 'aparelhoUm1' } };
  const header = trava.cookieDoPasse({ headers: {} }, SID, EMAIL, 'aparelhoUm1', agora);
  assert.match(header, /HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000/);
  const valor = header.split(';')[0];
  const req = { headers: { cookie: valor } };
  assert.ok(trava.passeValido(req, session, EMAIL, agora));
  assert.equal(trava.passeValido(req, session, 'outra@exemplo.invalid', agora), false);
  assert.equal(trava.passeValido(req, { ...session, id: 'cs_live_outra_compra' }, EMAIL, agora), false);
  assert.equal(trava.passeValido(req, session, EMAIL, agora + 31 * 86400 * 1000), false);
  assert.equal(trava.passeValido(req, { id: SID, metadata: {} }, EMAIL, agora), false, 'aparelho removido da compra perde o acesso');
  assert.equal(trava.passeValido({ headers: { cookie: valor.replace(/.$/, c => c === 'A' ? 'B' : 'A') } }, session, EMAIL, agora), false);
  const dois = trava.cookieDoPasse(req, 'cs_live_segunda', 'b@exemplo.invalid', 'aparelhoDois', agora).split(';')[0];
  assert.ok(trava.passeValido({ headers: { cookie: dois } }, session, EMAIL, agora));
});

test('limite de aparelhos e janela do primeiro navegador', () => {
  const agora = Date.now();
  const s = { created: Math.floor(agora / 1000) - 600, metadata: {} };
  assert.ok(trava.podeReivindicarPrimeiroNavegador(s, agora));
  assert.equal(trava.podeReivindicarPrimeiroNavegador({ ...s, metadata: { acesso_aparelhos: 'aparelhoUm1' } }, agora), false);
  assert.equal(trava.podeReivindicarPrimeiroNavegador({ ...s, created: Math.floor(agora / 1000) - 3 * 3600 }, agora), false);
  assert.ok(trava.novoAparelho({ metadata: { acesso_aparelhos: 'aparelhoUm1,aparelhoDo2' } }));
  assert.equal(trava.novoAparelho({ metadata: { acesso_aparelhos: 'aparelhoUm1,aparelhoDo2,aparelhoTr3' } }), null);
  assert.equal(trava.mascararEmail('thais@hotmail.com'), 'th•••@hotmail.com');
  assert.equal(trava.travaAtiva({ created: trava.TRAVA_DESDE_S - 1 }), false, 'compra antiga não é afetada');
  assert.ok(trava.travaAtiva({ created: trava.TRAVA_DESDE_S }));
});

test('área do aluno: link sem token nem passe não mostra o material', async () => {
  const paths = ['../lib/stripe', '../lib/email', '../lib/r2'];
  const originais = paths.map(p => { require(p); return require.cache[require.resolve(p)].exports; });
  const { catalog } = require('../lib/catalog');
  const slug = Object.keys(catalog).find(k => (catalog[k].assets?.chapters || []).length) ;
  // Compra nova cujo navegador de pagamento já pegou o passe (aparelho 1).
  const session = { id: SID, created: Math.max(trava.TRAVA_DESDE_S, Math.floor(Date.now() / 1000) - 5 * 3600), metadata: { acesso_aparelhos: 'aparelhoPago1' } };
  const antiga = { id: 'cs_live_antiga', created: trava.TRAVA_DESDE_S - 3600, metadata: {} };
  const enviados = [], metadados = [];
  require.cache[require.resolve(paths[0])].exports = {
    ...originais[0],
    verifyPurchase: async id => id === SID ? { session, slug, slugs: [slug], email: 'compradora@exemplo.invalid' } : id === antiga.id ? { session: antiga, slug, slugs: [slug], email: 'antiga@exemplo.invalid' } : null,
    updateSessionMetadata: async (id, m) => { metadados.push(m); Object.assign(session.metadata, m); },
    baseUrl: () => 'https://x.invalid'
  };
  require.cache[require.resolve(paths[1])].exports = { ...originais[1], sendAccessEmail: async m => { enviados.push(m); return { id: 'x' }; } };
  require.cache[require.resolve(paths[2])].exports = { signedProductAssets: async () => ({ cover: 'c', pdf: 'MATERIAL_PDF', pdfDownload: 'd', tracks: [] }) };
  const hp = require.resolve('../api/access-page'); delete require.cache[hp];
  const handler = require(hp);
  const chamar = async (query, cookie = '', method = 'GET', body) => {
    const res = { statusCode: 200, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(n) { this.statusCode = n; return this; }, send(b) { this.body = b; return this; }, end(b) { this.body = b || ''; return this; } };
    await handler({ method, query, headers: { cookie }, body }, res);
    return res;
  };
  try {
    // 1. Link compartilhado (sem token): trava, sem PDF.
    let r = await chamar({ session_id: SID });
    assert.equal(r.statusCode, 403);
    assert.doesNotMatch(r.body, /MATERIAL_PDF/);
    assert.match(r.body, /co•••+@exemplo\.invalid/);
    // 2. Token errado: trava.
    r = await chamar({ session_id: SID, t: 'x'.repeat(32) });
    assert.equal(r.statusCode, 403);
    // 3. Botão da trava manda o link SÓ para o e-mail da compra.
    r = await chamar({}, '', 'POST', { acao: 'enviar-acesso', session_id: SID, slug: '' });
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, 'compradora@exemplo.invalid');
    assert.match(enviados[0].accessUrl, /&t=/);
    // 4. Link do e-mail grava o passe e limpa o token do endereço.
    const t = new URL(enviados[0].accessUrl).searchParams.get('t');
    r = await chamar({ session_id: SID, t });
    assert.equal(r.statusCode, 303);
    assert.doesNotMatch(r.headers.location, /t=/);
    const cookie = r.headers['set-cookie'].split(';')[0];
    // 5. Com o passe, o material abre.
    r = await chamar({ session_id: SID }, cookie);
    assert.equal(r.statusCode, 200);
    assert.match(r.body, /MATERIAL_PDF/);
    // 6. Compra recém-paga: o primeiro navegador recebe o passe uma vez; o segundo cai na trava.
    session.created = Math.floor(Date.now() / 1000) - 60; session.metadata = {};
    r = await chamar({ session_id: SID });
    assert.equal(r.statusCode, 200);
    assert.ok(r.headers['set-cookie']);
    assert.ok(metadados.some(m => m.acesso_aparelhos));
    r = await chamar({ session_id: SID });
    assert.equal(r.statusCode, 403);
    // 7. Link do e-mail encaminhado: abre até o limite de aparelhos, depois bloqueia.
    r = await chamar({ session_id: SID, t }); assert.equal(r.statusCode, 303);
    r = await chamar({ session_id: SID, t }); assert.equal(r.statusCode, 303);
    r = await chamar({ session_id: SID, t });
    assert.equal(r.statusCode, 403);
    assert.match(r.body, /número máximo de aparelhos/);
    assert.equal(session.metadata.acesso_aparelhos.split(',').length, 3);
    // 8. Compra anterior à trava: continua abrindo como sempre (pedido do André).
    r = await chamar({ session_id: antiga.id });
    assert.equal(r.statusCode, 200);
    assert.match(r.body, /MATERIAL_PDF/);
  } finally {
    paths.forEach((p, i) => { require.cache[require.resolve(p)].exports = originais[i]; });
    delete require.cache[hp];
  }
});
