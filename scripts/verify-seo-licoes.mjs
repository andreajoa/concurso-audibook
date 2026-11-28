/**
 * Trava das lições de SEO/GEO de cada apostila (docs/seo-geo-pos-apostila.md).
 *
 * Roda dentro do `npm run build`, depois do verify:seo, e falha o build quando:
 *  - uma apostila à venda que não estava no ar em 27/11/2026 não tem ficha de
 *    pesquisa em content/seo-pesquisa/<slug>.json (concorrentes do topo, buscas
 *    de cauda longa e lacunas);
 *  - a ficha existe, mas a página não responde as lacunas que ela lista, ou o
 *    title e o H1 não trazem a consulta principal;
 *  - alguma página do sitemap repete frase de busca a ponto de virar keyword
 *    stuffing (lib/seo-licoes.js, função checarExcesso).
 *
 * Nada aqui fica mais rígido com o passar dos dias: o site é refeito todo dia e
 * o deploy das 03:05 não pode travar sozinho. Datas só aliviam (produto que sai
 * da venda deixa de ser conferido). Medição de IA e poda ficam no relatório
 * `npm run seo:acompanhamento`, que nunca derruba o build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const L = require('../lib/seo-licoes.js');
const { sellable } = require('../lib/exam-watch.js');

const root = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
let failed = false;
const fail = (m) => { console.error('FAIL ' + m); failed = true; };
const ok = (m) => console.log('SEO OK  ' + m);

const ORIGIN = 'https://www.concursotrilhaaprova.online';
const DOC = 'docs/seo-geo-pos-apostila.md';
const DIR = 'content/seo-pesquisa';
const BUILD_DATE = process.env.SITE_UPDATED || new Date().toISOString().slice(0, 10);
const NOW = process.env.SITE_UPDATED ? new Date(BUILD_DATE + 'T12:00:00Z') : new Date();

const catalog = JSON.parse(read('products/catalog.json'));
const dispensadas = new Set(JSON.parse(read(`${DIR}/_dispensadas.json`)).slugs);
const fichas = new Map();
for (const file of fs.readdirSync(path.join(root, DIR)).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
  const slug = file.slice(0, -'.json'.length);
  try {
    fichas.set(slug, JSON.parse(read(`${DIR}/${file}`)));
  } catch (e) {
    fail(`${DIR}/${file} não é JSON válido: ${e.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * 1. Ficha de pesquisa de cada apostila
 * ------------------------------------------------------------------ */

for (const [slug, ficha] of fichas) {
  if (!catalog[slug]) { fail(`${DIR}/${slug}.json não corresponde a nenhum produto do catálogo`); continue; }
  for (const m of L.validarFicha(ficha, slug)) fail(`${DIR}/${slug}.json: ${m}`);
}

// Frase extra que a checagem de repetição usa em cada página de produto: a consulta principal da ficha.
const extras = new Map();
let conferidas = 0;
for (const p of Object.values(catalog)) {
  if (!p || p.active !== true || p.kind === 'simulados' || !sellable(p, NOW)) continue;
  const ficha = fichas.get(p.slug);
  if (!ficha) {
    if (!dispensadas.has(p.slug)) {
      fail(`apostila ${p.slug} sem ficha de pesquisa: crie ${DIR}/${p.slug}.json antes de publicar (modelo em ${DIR}/_modelo.json, passo a passo em ${DOC})`);
    }
    continue;
  }
  const page = `public/apostilas/${p.slug}.html`;
  if (!exists(page)) { fail(`página da apostila não gerada: ${page}`); continue; }
  const html = read(page);
  const problemas = L.respostasAusentes(ficha, L.textoDaPagina(html))
    .map((pergunta) => `a página não responde "${pergunta}" (o trecho de resposta da ficha não aparece no texto da página)`);
  const fora = L.consultaFora(ficha, html);
  if (fora.length) problemas.push(`title e H1 não trazem "${fora.join(' ')}", da consulta principal "${ficha.consultaPrincipal}"`);
  for (const m of problemas) fail(`${p.slug}: ${m}`);
  if (!problemas.length) conferidas++;
  extras.set(page, [{ nome: ficha.consultaPrincipal, re: L.fraseRegex(ficha.consultaPrincipal) }]);
}
ok(`fichas de pesquisa: ${fichas.size} no repositório, ${conferidas} conferidas contra a página no ar`);

/* ------------------------------------------------------------------ *
 * 2. Repetição forçada de frase de busca (keyword stuffing)
 * ------------------------------------------------------------------ */

const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
let paginas = 0;
let comExcesso = 0;
for (const loc of locs) {
  if (!loc.startsWith(ORIGIN)) continue; // o verify:seo já barra URL fora do domínio
  const route = loc.slice(ORIGIN.length) || '/';
  const file = route === '/' ? 'public/index.html' : `public${route}.html`;
  if (!exists(file)) continue; // idem para página inexistente
  paginas++;
  const problemas = L.checarExcesso(read(file), extras.get(file) || []);
  if (problemas.length) comExcesso++;
  for (const m of problemas) fail(`${file}: ${m}. Escreva como gente fala: a frase de busca vai no title, no H1 e onde couber naturalmente (${DOC})`);
}
if (!comExcesso) ok(`${paginas} páginas do sitemap sem repetição forçada de frase de busca`);

if (failed) {
  console.error(`\nLições de SEO/GEO: corrija os itens acima. Passo a passo em ${DOC}.`);
  process.exit(1);
}
console.log('Lições de SEO/GEO conferidas.');
