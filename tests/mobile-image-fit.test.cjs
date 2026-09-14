const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('public/mobile-image-fit.css', 'utf8');
const headerCss = fs.readFileSync('public/site-header.css', 'utf8');
const headerJs = fs.readFileSync('public/site-header.js', 'utf8');
const home = fs.readFileSync('public/index.html', 'utf8');

test('a trava anti-recorte é carregada pelo cabeçalho compartilhado', () => {
  assert.match(headerCss, /@import url\('\/mobile-image-fit\.css\?v=20260914-no-crop'\)/);
});

test('o banner principal da home é uma imagem real e no mobile usa contain sem proporção forçada', () => {
  assert.match(home, /<img class="portal-lead-arte"[^>]+portal-hero-concursos\.webp/);
  assert.match(css, /\.portal-lead-arte\s*\{[\s\S]*?aspect-ratio:\s*auto\s*!important;[\s\S]*?object-fit:\s*contain\s*!important;/);
});

test('cards de notícias usam assets horizontais existentes e sem repetição planejada', () => {
  assert.match(headerJs, /hero-edital-desk\.webp/);
  assert.match(headerJs, /hero-concursos-desk\.webp/);
  assert.match(headerJs, /hero-concursos-sp-desk\.webp/);
  assert.match(headerJs, /hero-cidade-interior-desk\.webp/);
  assert.match(headerJs, /var usadas = \{\}/);
  assert.match(headerJs, /data-card-asset/);
});

test('cards horizontais preenchem o mobile sem barras laterais e sem mudar a proporção do asset', () => {
  assert.match(css, /\.portal-news-image\[data-card-asset\]\s*\{[\s\S]*?aspect-ratio:\s*8\s*\/\s*3\s*!important;[\s\S]*?background-size:\s*cover\s*!important;/);
  assert.match(css, /\.portal-news-image:not\(\[data-card-asset\]\)[\s\S]*?background-size:\s*contain\s*!important;/);
});

test('heroes internos exibem a imagem inteira no mobile', () => {
  assert.match(css, /\.portal-hero-art img\s*\{[\s\S]*?height:\s*auto\s*!important;[\s\S]*?object-fit:\s*contain\s*!important;/);
  assert.match(css, /\.portal-hero::after\s*\{[\s\S]*?display:\s*none\s*!important;/);
});

test('capas e imagens de produto usam contain no mobile', () => {
  for (const selector of ['.catalog-cover', '.catalog-card-cover img', '.portal-cover', '.cover-wrap img', '.product-intro img', '.format-object img']) {
    assert.ok(css.includes(selector), `seletor ausente: ${selector}`);
  }
  assert.match(css, /object-fit:\s*contain\s*!important;/);
});

test('banners fotográficos de apoio preservam a foto inteira', () => {
  assert.match(css, /\.promo-slide,[\s\S]*?\.atalho-card,[\s\S]*?\.portal-cta\s*\{[\s\S]*?background-size:\s*cover,\s*contain\s*!important;/);
});
