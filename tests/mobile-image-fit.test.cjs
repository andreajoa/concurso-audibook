const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('public/mobile-image-fit.css', 'utf8');
const headerCss = fs.readFileSync('public/site-header.css', 'utf8');
const home = fs.readFileSync('public/index.html', 'utf8');

test('a trava anti-recorte é carregada pelo cabeçalho compartilhado', () => {
  assert.match(headerCss, /@import url\('\/mobile-image-fit\.css\?v=20260914-no-crop'\)/);
});

test('o banner principal da home é uma imagem real e no mobile usa contain sem proporção forçada', () => {
  assert.match(home, /<img class="portal-lead-arte"[^>]+portal-hero-concursos\.webp/);
  assert.match(css, /\.portal-lead-arte\s*\{[\s\S]*?aspect-ratio:\s*auto\s*!important;[\s\S]*?object-fit:\s*contain\s*!important;/);
});

test('cards de notícias não cortam a fotografia no mobile', () => {
  assert.match(css, /\.portal-news-image\s*\{[\s\S]*?background-size:\s*contain\s*!important;[\s\S]*?background-repeat:\s*no-repeat\s*!important;/);
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
