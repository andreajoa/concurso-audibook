const { test } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../products/catalog.json');
const { sellable } = require('../lib/exam-watch.js');
const { classifyProduct, productH1, buildTaxonomyHubs } = require('../lib/taxonomy.js');

const products = Object.values(catalog).filter(p => p && p.active === true && sellable(p) && p.kind !== 'simulados');

test('todo produto ativo gera H1 transacional claro (Apostila/Curso/Cadernos/Kit)', () => {
  for (const p of products) {
    const h1 = productH1(p);
    assert.ok(h1.length >= 18, `H1 curto demais em ${p.slug}: ${h1}`);
    assert.match(h1, /^(Apostila|Curso|Cadernos|Kit)\b/i, `H1 sem palavra-chave inicial em ${p.slug}: ${h1}`);
    assert.ok(!/^Apostila\s+Apostila/i.test(h1), `H1 duplicado em ${p.slug}: ${h1}`);
  }
});

test('taxonomia normaliza bancas com grafias diferentes sem perder produtos', () => {
  const fcc = products.filter(p => classifyProduct(p).board?.slug === 'fcc');
  const vunesp = products.filter(p => classifyProduct(p).board?.slug === 'vunesp');
  const fgv = products.filter(p => classifyProduct(p).board?.slug === 'fgv');
  assert.ok(fcc.length >= 4, `esperava >=4 produtos FCC, veio ${fcc.length}`);
  assert.ok(vunesp.length >= 4, `esperava >=4 produtos VUNESP, veio ${vunesp.length}`);
  assert.ok(fgv.length >= 10, `esperava >=10 produtos FGV, veio ${fgv.length}`);
});

test('buildTaxonomyHubs gera hubs ricos com metaTitle <= 70 e description 70–160', () => {
  const tax = buildTaxonomyHubs(products);
  assert.ok(tax.boardHubs.length >= 6, 'esperava hubs para as principais bancas');
  assert.ok(tax.areaHubs.length >= 5, 'esperava hubs por área');
  assert.ok(tax.stateHubs.length >= 4, 'esperava hubs por estado + nacional');
  assert.ok(tax.levelHubs.length === 3, 'esperava os 3 hubs de escolaridade');

  const paths = new Set();
  for (const h of tax.allHubs) {
    assert.ok(!paths.has(h.path), `path duplicado: ${h.path}`);
    paths.add(h.path);
    assert.ok(h.metaTitle.length <= 70, `metaTitle > 70 em ${h.path}: ${h.metaTitle.length}`);
    assert.ok(h.description.length >= 70 && h.description.length <= 160, `description fora de 70-160 em ${h.path}: ${h.description.length}`);
    assert.ok(h.items.length >= 1, `hub vazio: ${h.path}`);
  }
  assert.ok(!tax.stateHubs.some(h => h.slug === 'pa'), 'preposição "para" não pode classificar apostila no Pará');
});
