/**
 * Relatório das etapas que vêm DEPOIS de publicar (docs/seo-geo-pos-apostila.md):
 *
 *  - D+14, presença em IA: a apostila aparece quando o candidato pergunta ao
 *    ChatGPT, ao Perplexity ou ao modo IA do Google? A medição é registrada na
 *    ficha (content/seo-pesquisa/<slug>.json, campo "geo").
 *  - D+90, poda: página do sitemap no ar há 90 dias sem nenhuma impressão no
 *    Search Console é candidata a melhorar, juntar com outra ou redirecionar
 *    (301) e sair do sitemap. Página fraca em massa puxa o site inteiro para
 *    baixo (core update de novembro de 2026).
 *
 * Uso:
 *   npm run seo:acompanhamento
 *   npm run seo:acompanhamento -- --gsc "/caminho/Páginas.csv"
 *
 * O CSV sai do Search Console (propriedade www.concursotrilhaaprova.online):
 * Desempenho > Resultados da pesquisa > Data: últimos 3 meses > Exportar > CSV.
 * Dentro do .zip, o arquivo "Páginas.csv" (ou "Pages.csv" com a interface em inglês).
 *
 * É relatório: nunca falha. As datas vêm do git (primeiro commit de cada página).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sellable, todayInBrazil } = require('../lib/exam-watch.js');

const root = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ORIGIN = 'https://www.concursotrilhaaprova.online';
const DIR = 'content/seo-pesquisa';
const HOJE = process.env.SITE_UPDATED || todayInBrazil();
const NOW = new Date(HOJE + 'T12:00:00Z');
const dias = (de, ate) => Math.round((Date.parse(ate) - Date.parse(de)) / 86400000);
const somaDias = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
// Páginas que existem por obrigação legal ou de atendimento: não competem por busca.
const INSTITUCIONAIS = new Set(['/privacidade', '/termos', '/cookies', '/cancelamentos', '/contato', '/sobre', '/entrega-e-acesso']);

function datasDeEntrada() {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--format=@%as', '--name-only', '--', 'public'],
      { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const entrada = new Map();
    let data = '';
    // O log vem do commit mais novo para o mais antigo: a última data vista é a da primeira publicação.
    for (const linha of out.split('\n')) {
      if (linha.startsWith('@')) data = linha.slice(1);
      else if (linha.trim()) entrada.set(linha.trim(), data);
    }
    return entrada;
  } catch {
    return null;
  }
}

function lerCsv(texto) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((v) => v !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((v) => v !== '')) linhas.push(linha);
  return linhas;
}

const semBarra = (u) => u.trim().replace(/\/+$/, '');
const entrada = datasDeEntrada();
const catalog = JSON.parse(read('products/catalog.json'));

/* ------------------------------------------------------------------ *
 * 1. Presença em IA (D+14)
 * ------------------------------------------------------------------ */

console.log(`Acompanhamento de SEO/GEO em ${HOJE}\n`);
console.log('1) Presença nas respostas de IA (D+14)');
const fichas = fs.readdirSync(path.join(root, DIR)).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
const medir = [];
const aguardar = [];
for (const file of fichas) {
  const slug = file.slice(0, -'.json'.length);
  const p = catalog[slug];
  if (!p || p.active !== true || !sellable(p, NOW)) continue;
  const ficha = JSON.parse(read(`${DIR}/${file}`));
  const publicada = (entrada && entrada.get(`public/apostilas/${slug}.html`)) || ficha.data;
  const geo = Array.isArray(ficha.geo) ? ficha.geo : [];
  const ultima = geo.map((g) => g && g.data).filter(Boolean).sort().pop();
  if (!ultima) {
    if (dias(publicada, HOJE) >= 14) medir.push(`   - ${slug}: no ar desde ${publicada}, ainda sem medição`);
    else aguardar.push(`   - ${slug}: medir a partir de ${somaDias(publicada, 14)}`);
  } else if (dias(ultima, HOJE) >= 90) {
    medir.push(`   - ${slug}: última medição em ${ultima}, medir de novo`);
  }
}
if (medir.length) {
  console.log('   Medir agora: perguntar no ChatGPT, no Perplexity e no modo IA do Google como o candidato pergunta');
  console.log('   ("qual a melhor apostila para <concurso>?", "<concurso> apostila pdf") e registrar em "geo" na ficha.');
  medir.forEach((l) => console.log(l));
} else {
  console.log('   Nada para medir hoje.');
}
aguardar.forEach((l) => console.log(l));
console.log(`   (${fichas.length} fichas; as apostilas anteriores a 27/11/2026 estão em ${DIR}/_dispensadas.json)\n`);

/* ------------------------------------------------------------------ *
 * 2. Poda (D+90)
 * ------------------------------------------------------------------ */

console.log('2) Poda: páginas no ar há 90 dias ou mais sem nenhuma impressão');
const iArg = process.argv.indexOf('--gsc');
const csvPath = iArg > -1 ? process.argv[iArg + 1] : '';
if (!csvPath) {
  console.log('   Sem o CSV do Search Console. Exporte: Desempenho > Resultados da pesquisa > últimos 3 meses >');
  console.log('   Exportar > CSV, e rode: npm run seo:acompanhamento -- --gsc "/caminho/Páginas.csv"');
} else if (!entrada) {
  console.log('   Sem histórico do git nesta cópia: não dá para saber há quanto tempo cada página está no ar.');
} else {
  const [cabecalho, ...linhas] = lerCsv(fs.readFileSync(csvPath, 'utf8'));
  const colUrl = cabecalho.findIndex((h) => /p[aá]gina|page|url/i.test(h));
  const colImp = cabecalho.findIndex((h) => /impress/i.test(h));
  if (colUrl < 0 || colImp < 0) {
    console.log(`   CSV sem as colunas de página e impressões (cabeçalho: ${cabecalho.join(' | ')}).`);
  } else {
    const comImpressao = new Set(linhas
      .filter((l) => Number(String(l[colImp] || '').replace(/\D/g, '')) > 0)
      .map((l) => semBarra(l[colUrl] || '')));
    const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const aVenda = new Set(Object.values(catalog).filter((p) => p && p.active === true && sellable(p, NOW)).map((p) => '/apostilas/' + p.slug));
    const candidatas = [];
    for (const loc of locs) {
      if (!loc.startsWith(ORIGIN)) continue;
      const route = loc.slice(ORIGIN.length) || '/';
      if (INSTITUCIONAIS.has(route)) continue;
      const file = route === '/' ? 'public/index.html' : `public${route}.html`;
      const desde = entrada.get(file);
      if (!desde || dias(desde, HOJE) < 90) continue;
      if (!comImpressao.has(semBarra(loc))) {
        candidatas.push(`   - ${route} (no ar desde ${desde})${aVenda.has(route) ? ': apostila à venda, melhorar a página' : ''}`);
      }
    }
    console.log(`   ${comImpressao.size} páginas com impressão no CSV; ${candidatas.length} candidatas à poda.`);
    if (candidatas.length) {
      console.log('   Para cada uma: melhorar com dado real que falta, juntar com a página irmã mais forte, ou');
      console.log('   redirecionar (301) para ela e tirar do sitemap. Apostila à venda não sai: melhora.');
      candidatas.forEach((l) => console.log(l));
    }
  }
}
