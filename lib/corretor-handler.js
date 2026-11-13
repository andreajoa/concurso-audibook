/* Corretor de Redação com IA (13/11/2026, pedido do André): bônus do Curso de Redação.
   O aluno envia foto, PDF ou texto; o Gemini transcreve, avalia por critério, aponta erros com a correção,
   dá dicas e devolve uma versão reescrita. Só quem comprou o curso (ou o dono, com o passe do dashboard) usa.
   Rota: POST /api/corretor  ->  /api/forms?op=corretor (o plano tem 12 funções, todas ocupadas). */
const crypto = require('crypto');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { verifyPurchase } = require('./stripe');

const CURSO = 'curso-redacao-concursos-2026';
const LIMITE = 60;                 // correções por compra
const MODELO = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const MAX_BYTES = 8 * 1024 * 1024;
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain']);

function passeDono(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)ta_dono=([^;]+)/);
  const segredo = process.env.R2_SECRET_ACCESS_KEY || process.env.STRIPE_SECRET_KEY || '';
  if (!m || segredo.length < 20) return false;
  const valor = decodeURIComponent(m[1]); const [exp] = valor.split('.');
  if (!Number.isFinite(Number(exp)) || Number(exp) < Date.now()) return false;
  const esperado = exp + '.' + crypto.createHmac('sha256', segredo).update('dono.' + exp).digest('base64url');
  return valor.length === esperado.length && crypto.timingSafeEqual(Buffer.from(valor), Buffer.from(esperado));
}

function r2() {
  return new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID || 'dbad4dc0550693a69d5956df7344e001'}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
}
const BUCKET = () => process.env.R2_BUCKET || 'apostila';
const chaveUso = id => `corretor-uso/${crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 32)}.json`;

async function lerUso(id) {
  try {
    const o = await r2().send(new GetObjectCommand({ Bucket: BUCKET(), Key: chaveUso(id) }));
    return JSON.parse(await o.Body.transformToString()).n || 0;
  } catch { return 0; }
}
async function gravarUso(id, n) {
  await r2().send(new PutObjectCommand({ Bucket: BUCKET(), Key: chaveUso(id), Body: JSON.stringify({ n, em: new Date().toISOString() }), ContentType: 'application/json' }));
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    legivel: { type: 'BOOLEAN', description: 'false se a imagem estiver ilegível, cortada ou não for uma redação' },
    aviso: { type: 'STRING', description: 'mensagem curta ao aluno quando legivel=false ou houver trechos ilegíveis; vazio se tudo certo' },
    transcricao: { type: 'STRING', description: 'texto do aluno transcrito fielmente, sem corrigir nada, com parágrafos separados por linha em branco; trechos ilegíveis como [ilegível]' },
    genero: { type: 'STRING' },
    notas: { type: 'OBJECT', properties: {
      tema_genero: { type: 'INTEGER' }, estrutura: { type: 'INTEGER' }, argumentacao: { type: 'INTEGER' }, coesao: { type: 'INTEGER' }, norma_padrao: { type: 'INTEGER' } },
      required: ['tema_genero', 'estrutura', 'argumentacao', 'coesao', 'norma_padrao'] },
    comentarios_criterio: { type: 'OBJECT', properties: {
      tema_genero: { type: 'STRING' }, estrutura: { type: 'STRING' }, argumentacao: { type: 'STRING' }, coesao: { type: 'STRING' }, norma_padrao: { type: 'STRING' } },
      required: ['tema_genero', 'estrutura', 'argumentacao', 'coesao', 'norma_padrao'] },
    resumo: { type: 'STRING', description: 'avaliação geral em 2 a 4 frases, tom de professor, em português' },
    pontos_fortes: { type: 'ARRAY', items: { type: 'STRING' } },
    erros: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      trecho: { type: 'STRING' }, tipo: { type: 'STRING', description: 'gramática, ortografia, pontuação, coesão, argumentação, estrutura ou adequação' },
      explicacao: { type: 'STRING' }, correcao: { type: 'STRING' } }, required: ['trecho', 'tipo', 'explicacao', 'correcao'] } },
    dicas: { type: 'ARRAY', items: { type: 'STRING' } },
    versao_reescrita: { type: 'STRING', description: 'a redação do aluno reescrita no nível de nota máxima, mantendo a tese e as ideias dele, com parágrafos separados por linha em branco' }
  },
  required: ['legivel', 'aviso', 'transcricao', 'genero', 'notas', 'comentarios_criterio', 'resumo', 'pontos_fortes', 'erros', 'dicas', 'versao_reescrita']
};

function instrucao(tema, banca, generoPedido) {
  return `Você é um corretor experiente de redações de concursos públicos brasileiros e professor de Língua Portuguesa.
Corrija a redação enviada pelo aluno.
Tema da prova: ${tema || '(o aluno não informou; deduza pelo texto e diga isso no resumo)'}
Banca: ${banca || 'não informada'}
Gênero pedido: ${generoPedido || 'dissertativo-argumentativo (padrão), salvo se o texto indicar outro'}

Regras:
1. Primeiro transcreva o texto exatamente como está, inclusive com os erros. Se for foto de manuscrito, leia com cuidado; marque [ilegível] no que não der para ler. Não invente palavras.
2. Avalie em 5 critérios, cada um de 0 a 20 pontos (total 100): tema_genero (adequação ao tema e ao gênero; fuga total = 0), estrutura (introdução com tese, desenvolvimento, conclusão; paragrafação), argumentacao (pertinência, aprofundamento, repertório legitimado e explicado), coesao (conectivos, referência, progressão, coerência), norma_padrao (gramática, ortografia, acentuação, pontuação, crase, regência, concordância, registro formal). Seja rigoroso e realista como uma banca: texto mediano fica perto de 50-65.
3. Liste os erros concretos (até 25), cada um com o trecho original exato, o tipo, a explicação curta da regra e a correção.
4. Dê de 4 a 7 dicas práticas e específicas para ESTE texto (não genéricas).
5. Reescreva a redação inteira em nível de nota máxima, mantendo a tese, as ideias e a extensão aproximada do aluno (cerca de 20 a 30 linhas), corrigindo tudo e melhorando argumentação e coesão. Não invente dados numéricos nem citações falsas; use apenas referências verdadeiras e verificáveis (leis, órgãos oficiais).
6. Escreva tudo em português do Brasil, em tom respeitoso e encorajador.
7. Se o conteúdo não for uma redação (ou estiver vazio/ilegível), retorne legivel=false, aviso explicando o que fazer, notas 0 e os demais campos vazios.`;
}

async function corrigir({ tema, banca, genero, texto, arquivo }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('corretor_sem_chave'), { status: 503 });
  const parts = [{ text: instrucao(tema, banca, genero) }];
  if (texto) parts.push({ text: 'Redação do aluno:\n\n' + texto });
  else parts.push({ inline_data: { mime_type: arquivo.mime, data: arquivo.data } });
  // Modelo principal e reservas: em pico de demanda o Gemini responde 503/429; tenta o próximo.
  const modelos = [...new Set([MODELO, 'gemini-3-flash-preview', 'gemini-3.1-flash-lite'])];
  let r, j = {};
  for (const [i, m] of modelos.entries()) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 55000);
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      signal: ctl.signal, method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: SCHEMA } })
    }).catch(e => ({ ok: false, status: 504, json: async () => ({ error: e.name }) }));
    clearTimeout(timer);
    j = await r.json().catch(() => ({}));
    if (r.ok || ![404, 429, 500, 503, 504].includes(r.status)) break;
    console.error('corretor_modelo_ocupado', m, r.status);
    if (i < modelos.length - 1) await new Promise(ok => setTimeout(ok, 800));
  }
  if (!r.ok) throw Object.assign(new Error('gemini_' + r.status + ' ' + JSON.stringify(j).slice(0, 300)), { status: 502 });
  const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
  const out = JSON.parse(txt);
  const n = out.notas || {};
  for (const k of ['tema_genero', 'estrutura', 'argumentacao', 'coesao', 'norma_padrao']) n[k] = Math.max(0, Math.min(20, Math.round(Number(n[k]) || 0)));
  out.nota_total = Object.values(n).reduce((a, b) => a + b, 0);
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Método não permitido.' }); }
  const b = req.body || {};
  const dono = passeDono(req);
  const sid = String(b.session_id || '').slice(0, 300);
  let id = 'dono';
  if (!dono) {
    const compra = await verifyPurchase(sid, CURSO).catch(() => null);
    if (!compra) return res.status(403).json({ error: 'O corretor é exclusivo de quem comprou o Curso de Redação. Abra o corretor pelo link da sua área de acesso.' });
    id = compra.session.id;
  }
  const texto = typeof b.texto === 'string' ? b.texto.trim().slice(0, 15000) : '';
  let arquivo = null;
  if (!texto) {
    const mime = String(b.mime || '').toLowerCase(); const data = String(b.data || '');
    if (!TIPOS.has(mime) || !data) return res.status(400).json({ error: 'Envie uma foto (JPG, PNG ou WEBP), um PDF ou cole o texto da redação.' });
    const bytes = Buffer.byteLength(data, 'base64');
    if (bytes > MAX_BYTES) return res.status(413).json({ error: 'Arquivo grande demais (máximo 8 MB). Tire a foto com resolução menor ou envie em PDF.' });
    if (mime === 'text/plain') { const t = Buffer.from(data, 'base64').toString('utf8').trim().slice(0, 15000); if (!t) return res.status(400).json({ error: 'O arquivo de texto está vazio.' }); arquivo = null; b.__texto = t; }
    else arquivo = { mime, data };
  } else if (texto.split(/\s+/).length < 40) return res.status(400).json({ error: 'O texto está muito curto para ser corrigido como redação (mínimo de 40 palavras).' });
  const usados = await lerUso(id);
  if (!dono && usados >= LIMITE) return res.status(429).json({ error: `Você já usou as ${LIMITE} correções incluídas no curso.` });
  try {
    const out = await corrigir({ tema: String(b.tema || '').slice(0, 400), banca: String(b.banca || '').slice(0, 80), genero: String(b.genero || '').slice(0, 80), texto: texto || b.__texto, arquivo });
    if (out.legivel !== false) await gravarUso(id, usados + 1).catch(e => console.error('corretor_uso', e.message));
    return res.status(200).json({ ok: true, restantes: dono ? null : Math.max(0, LIMITE - usados - (out.legivel !== false ? 1 : 0)), resultado: out });
  } catch (e) {
    console.error('corretor', e.message);
    return res.status(e.status || 500).json({ error: 'Não conseguimos corrigir agora. Tente novamente em alguns instantes.' });
  }
};
module.exports.CURSO = CURSO;
module.exports.LIMITE = LIMITE;
