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

const vercel = JSON.parse(read('vercel.json'));
const gscRewrite = (vercel.rewrites || []).find((r) => r.source === `/${GSC_TOKEN}.html`);
if (!gscRewrite || gscRewrite.destination !== `/gsc/${GSC_TOKEN}.txt`) {
  fail('vercel.json sem rewrite de /' + GSC_TOKEN + '.html para o token');
} else {
  ok('rewrite do Search Console sem redirecionamento');
}
if (!(vercel.rewrites || []).some((r) => r.source === `/${GSC_TOKEN}.html`) ||
    !JSON.stringify(vercel.headers || []).includes('text/html; charset=utf-8')) {
  fail('vercel.json deve servir o token como text/html');
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
const pages = fs.readdirSync(path.join(root, 'public'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => `public/${f}`)
  .concat(exists('public/apostilas')
    ? fs.readdirSync(path.join(root, 'public/apostilas')).map((f) => `public/apostilas/${f}`)
    : []);

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

if (failed) process.exit(1);
console.log('\nVerificação de SEO/GEO aprovada: indexação, dados estruturados e camada para IAs.');
