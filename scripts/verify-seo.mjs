// Trava estrutural de SEO e GEO.
//
// O objetivo aqui não é "checar se o build rodou", e sim impedir as três formas
// de quebrar a indexação que já custaram caro neste projeto:
//   1. a verificação do Google Search Console parar de responder 200;
//   2. uma página entrar no sitemap apontando para um arquivo que não existe,
//      ou uma página privada vazar para o índice;
//   3. as páginas de cidade virarem páginas-ponte (mesmo título/descrição
//      repetidos), o que o próprio docs/search-console.md proíbe.
//
// Também bloqueia dados estruturados inventados (avaliação/review sem cliente
// real), porque isso é motivo de ação manual no Search Console.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let failed = false;
const fail = (m) => { console.error('FAIL ' + m); failed = true; };
const ok = (m) => console.log('SEO OK  ' + m);

const ORIGIN = 'https://www.concursotrilhaaprova.online';

// ---------------------------------------------------------------- artefatos
const artifacts = [
  'public/sitemap.xml',
  'public/robots.txt',
  'public/llms.txt',
  'public/llms-full.txt',
  'public/feed.xml',
  'public/site.webmanifest',
  'public/404.html',
  'content/local-seo.json',
  'content/search-guides.json',
  'content/articles.json',
  'content/editorial-backlog.json',
];
for (const file of artifacts) exists(file) ? ok(file) : fail('missing ' + file);

// -------------------------------------------- verificação do Search Console
// cleanUrls faz o Vercel redirecionar (308) qualquer /arquivo.html na raiz, e o
// Google trata redirecionamento como falha de verificação. Por isso o token fica
// em /gsc/*.txt e chega na URL exigida por rewrite, que não redireciona.
const GSC_TOKEN = 'googlef2a7a77b144edac3';
const gscFile = `public/gsc/${GSC_TOKEN}.txt`;
if (!exists(gscFile)) {
  fail('missing ' + gscFile);
} else if (read(gscFile).trim() !== `google-site-verification: ${GSC_TOKEN}.html`) {
  fail('conteúdo do arquivo de verificação do Search Console não confere');
} else {
  ok('arquivo de verificação do Search Console');
}

// Medido em produção em 2026-09-13: na Vercel os redirects gerados por cleanUrls
// são avaliados ANTES dos rewrites. Com cleanUrls ligado, nenhuma URL terminada em
// .html responde 200 — ela vira 308 para a versão sem extensão. Um rewrite de
// /<token>.html é, portanto, configuração morta: nunca chega a ser avaliado.
// Por isso a verificação por arquivo HTML não é usada aqui, e este teste existe
// para impedir que alguém a reintroduza acreditando que funciona.
const vercel = JSON.parse(read('vercel.json'));
const rewriteSources = new Set((vercel.rewrites || []).map((r) => r.source));
if (vercel.cleanUrls) {
  // Um rewrite de /x.html só continua valendo se /x — o destino do 308 — também
  // estiver coberto. É o caso de /acesso.html, que cai em /acesso. Sem essa dupla,
  // o rewrite é inalcançável, como era o do token do Search Console.
  const orphaned = [...rewriteSources]
    .filter((s) => s.endsWith('.html'))
    .filter((s) => !rewriteSources.has(s.slice(0, -'.html'.length)));
  if (orphaned.length) {
    fail('rewrite inalcançável com cleanUrls (o 308 vem antes): ' + orphaned.join(', '));
  } else {
    ok('nenhum rewrite .html inalcançável por causa do cleanUrls');
  }
}

// Segundo método de verificação: a meta tag precisa continuar na home.
const home = read('public/index.html');
if (!/<meta name="google-site-verification" content="[A-Za-z0-9_-]{10,200}">/.test(home)) {
  fail('home sem meta tag google-site-verification');
} else {
  ok('meta tag de verificação na home');
}

// ------------------------------------------------------------------ sitemap
const sitemap = read('public/sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length < 15) fail(`sitemap com apenas ${locs.length} URLs`);

const PRIVATE = ['/dashboard', '/comprar', '/obrigado', '/recuperar', '/acesso', '/api/', '/gsc/'];
for (const loc of locs) {
  if (!loc.startsWith(ORIGIN)) { fail('sitemap com URL fora do domínio: ' + loc); continue; }
  const route = loc.slice(ORIGIN.length) || '/';
  if (PRIVATE.some((p) => route.startsWith(p))) fail('sitemap expõe rota privada: ' + route);
  const file = route === '/' ? 'public/index.html' : `public${route}.html`;
  if (!exists(file)) fail(`sitemap aponta para página inexistente: ${route} (${file})`);
}
if (new Set(locs).size !== locs.length) fail('sitemap com URLs duplicadas');
if (!/<lastmod>/.test(sitemap)) fail('sitemap sem lastmod');
ok(`sitemap com ${locs.length} URLs, todas existentes em disco`);

// -------------------------------------------------------------------- robots
const robots = read('public/robots.txt');
if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) fail('robots.txt sem linha Sitemap');
if (!robots.includes('Disallow: /gsc/')) fail('robots.txt deve esconder /gsc/ do índice');
// GEO: sem estes agentes liberados o site não é lido pelos buscadores de IA.
const AI_AGENTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User',
  'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'meta-externalagent', 'CCBot'];
const missingAgents = AI_AGENTS.filter((a) => !new RegExp(`User-agent: ${a}\\b`).test(robots));
if (missingAgents.length) fail('robots.txt sem liberação para: ' + missingAgents.join(', '));
else ok(`robots.txt libera ${AI_AGENTS.length} rastreadores de IA`);

// ------------------------------------------------------------------ llms.txt
const llms = read('public/llms.txt');
if (!llms.startsWith('# Trilha Aprova')) fail('llms.txt deve começar com o título do site');
if (!llms.includes('> ')) fail('llms.txt sem resumo em blockquote (convenção llmstxt.org)');
if (read('public/llms-full.txt').length < 20000) fail('llms-full.txt curto demais para ser útil a uma IA');
ok('llms.txt e llms-full.txt no formato esperado');

// --------------------------------------------------- auditoria página a página
const subdir = (d) => exists(d) ? fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.html')).map((f) => `${d}/${f}`) : [];

const pages = fs.readdirSync(path.join(root, 'public'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => `public/${f}`)
  .concat(subdir('public/apostilas'), subdir('public/materias'));

const titles = new Map();
const descriptions = new Map();
let indexable = 0;

for (const page of pages) {
  const html = read(page);
  const isNoindex = /content="noindex/.test(html);

  // JSON-LD quebrado é pior que ausente: o Google descarta o bloco inteiro em silêncio.
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(block[1]);
    } catch (e) {
      fail(`JSON-LD inválido em ${page}: ${e.message}`);
    }
  }
  if (/"aggregateRating"|"@type":\s*"Review"/.test(html)) {
    fail(`${page} declara avaliação/review — só é permitido com avaliação real de comprador`);
  }

  if (isNoindex) continue;
  indexable++;

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const h1Count = (html.match(/<h1[\s>]/g) || []).length;

  if (!title) fail(`${page} sem <title>`);
  else if (title.length > 70) fail(`${page} com title de ${title.length} caracteres (corta na SERP)`);
  if (!description) fail(`${page} sem meta description`);
  else if (description.length < 70 || description.length > 160) {
    // O Google corta a descrição por volta de 160 caracteres; passar disso
    // significa entregar uma frase truncada no meio na página de resultados.
    fail(`${page} com meta description de ${description.length} caracteres (ideal 70–160)`);
  }
  if (!canonical) fail(`${page} sem canonical`);
  else if (!canonical.startsWith(ORIGIN)) fail(`${page} com canonical fora do domínio`);
  if (h1Count !== 1) fail(`${page} tem ${h1Count} elementos h1 (deve ter exatamente 1)`);
  if (!/hreflang="pt-BR"/.test(html)) fail(`${page} sem hreflang pt-BR`);

  // Com cleanUrls, um link interno para /pagina.html custa um 308 em cada clique
  // e dilui o link interno. Os links têm de apontar direto para a URL limpa.
  for (const link of html.matchAll(/href="(\/[^"]*\.html)"/g)) {
    fail(`${page} linka ${link[1]} — use a URL sem .html (cleanUrls redireciona)`);
  }
  if (!/<script type="application\/ld\+json">/.test(html)) fail(`${page} sem dados estruturados`);

  // Título ou descrição repetidos entre páginas é a assinatura de página-ponte.
  if (title) {
    if (titles.has(title)) fail(`title duplicado entre ${titles.get(title)} e ${page}`);
    titles.set(title, page);
  }
  if (description) {
    if (descriptions.has(description)) {
      fail(`meta description duplicada entre ${descriptions.get(description)} e ${page}`);
    }
    descriptions.set(description, page);
  }
}
ok(`${indexable} páginas indexáveis auditadas: title, description, canonical, h1, hreflang e JSON-LD`);

// -------------------------------------------------- páginas de cidade (local)
// O docs/search-console.md proíbe repetir a mesma página por cidade. Aqui a regra
// vira teste: cada cidade precisa citar órgãos oficiais próprios e ter corpo próprio.
const cities = JSON.parse(read('content/local-seo.json'));
const bodies = new Map();
for (const city of cities) {
  const page = `public/${city.slug}.html`;
  if (!exists(page)) { fail('página de cidade não gerada: ' + city.slug); continue; }
  const html = read(page);
  if (!html.includes(city.city)) fail(`${page} não menciona ${city.city}`);
  if (!Array.isArray(city.orgaos) || city.orgaos.length < 2) {
    fail(`${city.slug} precisa citar ao menos 2 órgãos oficiais`);
  }
  const text = (html.match(/<main[\s\S]*?<\/main>/)?.[0] || '').replace(/<[^>]+>/g, ' ');
  const fingerprint = text.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (bodies.has(fingerprint)) fail(`conteúdo de cidade repetido entre ${bodies.get(fingerprint)} e ${city.slug}`);
  bodies.set(fingerprint, city.slug);
  // Promessa de vaga é o que transforma conteúdo local em problema jurídico e de
  // qualidade. As páginas citam esses termos de propósito, mas sempre negados
  // ("não divulgamos vagas"), então só conta como anúncio o que não vem negado.
  for (const m of text.matchAll(/vagas? abertas?|inscrições abertas|salário de R\$/gi)) {
    const before = text.slice(Math.max(0, m.index - 90), m.index);
    if (!/\bn[ãa]o\b|\bnem\b|\bsem\b/i.test(before)) {
      fail(`${page} anuncia "${m[0]}" sem negação — o site não divulga edital`);
    }
  }
}
ok(`${cities.length} páginas de cidade com conteúdo próprio e sem promessa de vaga`);

// ------------------------------------------------- matérias escritas por IA
// Estas páginas não foram escritas por uma pessoa. A validação em
// lib/editorial.js roda ANTES de publicar, mas ela vive no worker: se alguém
// editar content/articles.json à mão, ou se o worker for alterado, a única
// coisa entre uma vaga inventada e o índice do Google é esta trava aqui. Por
// isso ela repete a verificação factual em vez de confiar na anterior.
const articles = JSON.parse(read('content/articles.json'));
const { factualProblems } = await import('../lib/editorial.js').then((m) => m.default || m);

for (const a of articles) {
  const page = `public/materias/${a.slug}.html`;
  if (!exists(page)) { fail('matéria não gerada: ' + a.slug); continue; }
  const html = read(page);
  const text = (html.match(/<main[\s\S]*?<\/main>/)?.[0] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const problems = factualProblems(text);
  if (problems.length) fail(`matéria ${a.slug} afirma o que não pode sustentar — ${problems.join('; ')}`);

  // Uma matéria sem link interno é um beco sem saída: não distribui autoridade
  // e não leva o leitor a lugar nenhum.
  const internal = [...html.matchAll(/<main[\s\S]*?<\/main>/g)][0]?.[0] || '';
  if ((internal.match(/href="\//g) || []).length < 5) fail(`matéria ${a.slug} com poucos links internos`);
  if (!a.published || !/^\d{4}-\d{2}-\d{2}$/.test(a.published)) fail(`matéria ${a.slug} sem data de publicação válida`);
  if (!a.topicId) fail(`matéria ${a.slug} sem pauta de origem`);
}
const topicIds = articles.map((a) => a.topicId);
if (new Set(topicIds).size !== topicIds.length) fail('a mesma pauta foi publicada duas vezes');
ok(`${articles.length} matéria(s) publicada(s) sem afirmação factual não sustentável`);

// O backlog é o que impede o cron de inventar pauta quando a fila acaba.
const backlog = JSON.parse(read('content/editorial-backlog.json'));
const remaining = backlog.filter((t) => !topicIds.includes(t.id)).length;
if (new Set(backlog.map((t) => t.id)).size !== backlog.length) fail('backlog editorial com id duplicado');
for (const t of backlog) {
  if (!t.id || !t.title || !t.angle || !t.keyword || !t.scope || !t.type) fail(`pauta incompleta no backlog: ${t.id || '(sem id)'}`);
}
ok(`backlog editorial com ${remaining} pauta(s) restante(s) (${Math.floor(remaining / 4)} meses de publicação semanal)`);

// ------------------------------------------------------------------ IndexNow
const keyFile = fs.readdirSync(path.join(root, 'public')).find((f) => /^[A-Za-z0-9-]{8,128}\.txt$/.test(f) && f !== 'robots.txt' && !f.startsWith('llms'));
if (!keyFile) {
  fail('sem arquivo de chave do IndexNow na raiz pública');
} else if (read(`public/${keyFile}`).trim() !== keyFile.replace(/\.txt$/, '')) {
  fail('o arquivo de chave do IndexNow precisa conter exatamente a própria chave');
} else {
  ok('chave do IndexNow publicada na raiz');
}

if (failed) process.exit(1);
console.log('\nVerificação de SEO/GEO aprovada: indexação, dados estruturados e camada para IAs.');
