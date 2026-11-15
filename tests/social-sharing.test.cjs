const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../products/catalog.json');
const ORIGIN = 'https://www.concursotrilhaaprova.online';
const ROOT = path.resolve(__dirname, '..', 'public');

function meta(html, name, attr = 'property') {
  const match = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]+)"`));
  assert.ok(match, `missing ${name}`);
  return match[1];
}
function checkPage(file, expectedImage) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.equal(meta(html, 'og:image'), expectedImage);
  assert.equal(meta(html, 'og:image:secure_url'), expectedImage);
  assert.equal(meta(html, 'twitter:image', 'name'), expectedImage);
  assert.equal(meta(html, 'og:image:type'), 'image/jpeg');
  assert.equal(meta(html, 'og:image:width'), '1200');
  assert.equal(meta(html, 'og:image:height'), '630');
  const localImage = path.join(ROOT, new URL(expectedImage).pathname);
  const img = fs.readFileSync(localImage);
  assert.ok(img.length > 10000, `small social preview: ${localImage}`);
  assert.equal(img[0], 0xff);
  assert.equal(img[1], 0xd8);
}

test('home social preview shows brand logo, not any product cover', () => {
  checkPage('index.html', `${ORIGIN}/assets/social/trilha-aprova.jpg`);
});

test('each apostila has a distinct absolute, JPG social preview', () => {
  const products = Object.values(catalog).filter(p => p.active && p.kind !== 'simulados');
  assert.ok(products.length > 0);
  for (const product of products) {
    checkPage(`apostilas/${product.slug}.html`, `${ORIGIN}/assets/social/${product.slug}.jpg`);
  }
});
