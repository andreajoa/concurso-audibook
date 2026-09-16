const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const slug = 'professor-adjunto-i-ibam-santos-2026';
const catalog = require('../products/catalog.json');
const product = catalog[slug];
const coverPath = 'public/assets/apostila-professor-adjunto-i-3d.png';

test('Professor Adjunto I is a complete sellable product with isolated private assets', () => {
  assert.ok(product);
  assert.equal(product.active, true);
  assert.equal(product.priceCents, 2499);
  assert.equal(product.assets.chapters.length, 8);
  const keys = [product.assets.pdfKey, product.assets.coverKey, product.assets.summary.key,
    ...product.assets.chapters.map(track => track.key)];
  assert.equal(keys.length, 11);
  assert.equal(new Set(keys).size, 11);
  assert.ok(keys.every(key => key.startsWith(slug + '/')));
});

test('Professor cover is the validated real PNG binary supplied for the product', () => {
  const bytes = fs.readFileSync(coverPath);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1122);
  assert.equal(bytes.readUInt32BE(20), 1402);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    'ffb24a6d1c9a8cc8eda4eaadc37a68a6474e105f07d9790c77bbb416f85da013');
});

test('Professor storefront page uses a normal binary URL, never an inline data URI', () => {
  const page = fs.readFileSync('public/apostilas/' + slug + '.html', 'utf8');
  assert.match(page, /Professor Adjunto I/);
  assert.match(page, /apostila-professor-adjunto-i-3d\.png/);
  assert.doesNotMatch(page, /data:image\//i);
  assert.doesNotMatch(page, /Esta apostila trabalha redação para candidatos de ensino fundamental completo/);
  const title = page.match(/<title>(.*?)<\/title>/s)?.[1] || '';
  assert.ok(title.length > 20 && title.length <= 60, title);
});
