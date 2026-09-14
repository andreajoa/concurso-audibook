const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('API entrypoints stay within the Vercel Hobby limit', () => {
  const functions = fs.readdirSync(path.join(root, 'api'), { recursive: true })
    .filter((file) => /\.(?:[cm]?js|ts|py|go|rb)$/.test(file));
  assert.ok(functions.length <= 12,
    `${functions.length} API functions exceed the Vercel Hobby limit of 12`);
});

test('scheduled jobs resolve to the shared function and reject unauthenticated requests', async () => {
  const config = require('../vercel.json');
  for (const cron of config.crons) {
    const rewrite = config.rewrites.find((route) => route.source === cron.path);
    assert.ok(rewrite, `${cron.path} needs a rewrite to the shared function`);
    const destination = new URL(rewrite.destination, 'https://example.com');
    assert.equal(destination.pathname, '/api/cron');
    const handler = require('../api/cron');
    const req = { method: 'GET', headers: {}, query: Object.fromEntries(destination.searchParams) };
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler(req, res);
    assert.equal(res.statusCode, 401, `${cron.path} must require CRON_SECRET`);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  }
});

test('unknown cron jobs are rejected before executing a worker', async () => {
  const handler = require('../api/cron');
  for (const job of [undefined, 'unknown', 'toString', ['editorial', 'marketing']]) {
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler({ method: 'GET', headers: {}, query: { job } }, res);
    assert.equal(res.statusCode, 404);
  }
});

test('authenticated requests select the correct cron worker', async (t) => {
  const handler = require('../api/cron');
  const saved = Object.fromEntries(['CRON_SECRET', 'STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY']
    .map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.CRON_SECRET = 'cron-test-only';
  process.env.STRIPE_SECRET_KEY = 'stripe-test-only';
  delete process.env.ANTHROPIC_API_KEY;
  const calls = [];
  t.mock.method(global, 'fetch', async (url) => {
    calls.push(url);
    assert.ok(url.startsWith('https://api.stripe.com/v1/checkout/sessions?'));
    return { ok: true, json: async () => ({ data: [], has_more: false }) };
  });
  const run = async (job) => {
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler({ method: 'GET', headers: { authorization: 'Bearer cron-test-only' }, query: { job } }, res);
    return res;
  };
  const marketing = await run('marketing');
  assert.equal(marketing.statusCode, 200);
  assert.deepEqual(marketing.body, { ok: true, delivered: 0, skipped: 0, checked: 0 });
  assert.equal(calls.length, 1);
  const editorial = await run('editorial');
  assert.equal(editorial.statusCode, 500);
  assert.deepEqual(editorial.body, { error: 'missing_env', missing: 'ANTHROPIC_API_KEY' });
  assert.equal(calls.length, 1, 'editorial must not execute the marketing worker');
});

/* Quem chega ao site raramente chega pela home: chega numa página de cidade
   vinda do Google, ou na de agradecimento logo depois de pagar. De qualquer uma
   delas precisa dar para ir a qualquer outra. O cabeçalho é carimbado pelo
   build em todas as páginas — este teste existe para que nenhuma escape. */
test('toda página pública carrega o mesmo menu de navegação', () => {
  const publico = path.join(root, 'public');
  const paginas = [];
  (function varrer(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, entrada.name);
      if (entrada.isDirectory()) varrer(caminho);
      else if (entrada.name.endsWith('.html')) paginas.push(caminho);
    }
  })(publico);

  assert.ok(paginas.length > 20, 'esperava dezenas de páginas em public/');

  const destinos = ['/apostilas-para-concurso', '/ferramentas', '/materias', '/concursos', '/contato', '/recuperar'];
  for (const caminho of paginas) {
    const nome = path.relative(publico, caminho);
    // O painel é interno: não é site público e não deve puxar visita.
    if (nome === 'dashboard.html') continue;
    const html = fs.readFileSync(caminho, 'utf8');

    assert.equal((html.match(/class="guide-header"/g) || []).length, 1,
      `${nome} precisa de exatamente um cabeçalho de navegação`);
    assert.ok(html.includes('/site-header.css'),
      `${nome} carrega o cabeçalho sem a folha de estilo dele`);
    // Sem esta linha o navegador vai buscar /favicon.ico, não acha, e a aba
    // fica com o ícone de página abandonada.
    assert.ok(html.includes('href="/favicon.svg"'),
      `${nome} não declara o ícone da aba`);
    // Nenhuma página pode nascer com rolagem lateral: no celular o dedo arrasta
    // o texto para fora da tela e a pessoa acha que o site quebrou.
    assert.ok(!/<meta name="viewport"[^>]*(user-scalable=no|maximum-scale=1)/.test(html),
      `${nome} impede o leitor de ampliar a página`);
    for (const destino of destinos) {
      assert.ok(html.includes(`href="${destino}"`),
        `${nome} não oferece caminho para ${destino}`);
    }
  }
});

test('no celular todo link do menu é grande o bastante para o dedo', () => {
  /* Medir geometria exige navegador, e o gate roda sem um. O que dá para
     garantir aqui é a causa: sem recuo vertical o link do menu tem a altura
     da própria linha de texto — 14px — e o dedo erra o alvo. A WCAG 2.5.8
     pede 24px. Este teste protege a regra que produz essa altura. */
  const css = fs.readFileSync(path.join(root, 'public/site-header.css'), 'utf8');
  const celular = css.split('@media(max-width:900px)')[1];
  assert.ok(celular, 'o cabeçalho precisa de um bloco para telas pequenas');

  const regra = celular.match(/\.guide-header nav a\{([^}]*)\}/);
  assert.ok(regra, 'no celular os links do menu precisam de regra própria');

  const padding = regra[1].match(/padding:(\d+)px/);
  assert.ok(padding, 'os links do menu no celular precisam de recuo vertical');

  const fonte = Number((regra[1].match(/font-size:(\d+)px/) || [])[1] || 16);
  const linha = Number((regra[1].match(/line-height:([\d.]+)/) || [])[1] || 1.2);
  const altura = fonte * linha + Number(padding[1]) * 2;
  assert.ok(altura >= 24,
    `o alvo de toque do menu ficaria com ${altura.toFixed(0)}px; a WCAG pede 24px`);
});
