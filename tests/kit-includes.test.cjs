const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../products/catalog.json');
const { sessionSlugs } = require('../lib/stripe');

const meta = slug => ({ metadata: { site_id: 'concurso_audiobook', project_id: 'concurso_audiobook', product_slug: slug } });

test('kits declaram apenas produtos ativos e existentes, sem incluir a si mesmos', () => {
  const kits = Object.values(catalog).filter(p => Array.isArray(p.includes));
  assert.ok(kits.length >= 1, 'há pelo menos um kit no catálogo');
  for (const kit of kits) {
    assert.ok(kit.includes.length >= 2, `${kit.slug}: kit com pelo menos dois itens`);
    for (const slug of kit.includes) {
      assert.notEqual(slug, kit.slug, `${kit.slug}: não pode incluir a si mesmo`);
      assert.ok(catalog[slug] && catalog[slug].active, `${kit.slug}: ${slug} precisa existir e estar ativo`);
      assert.ok(!Array.isArray(catalog[slug].includes), `${kit.slug}: kit dentro de kit não é permitido`);
    }
  }
});

test('a compra de um kit libera o kit e todas as apostilas incluídas', () => {
  const kit = Object.values(catalog).find(p => Array.isArray(p.includes));
  const slugs = sessionSlugs(meta(kit.slug));
  assert.equal(slugs[0], kit.slug);
  for (const s of kit.includes) assert.ok(slugs.includes(s), `${s} liberado pelo kit`);
});

test('produto comum continua liberando só ele mesmo (mais bump e upsell)', () => {
  const slugs = sessionSlugs({ metadata: { product_slug: 'informatica-para-concursos', bump_slugs: 'redacao-nivel-fundamental-2026' } });
  assert.deepEqual(slugs, ['informatica-para-concursos', 'redacao-nivel-fundamental-2026']);
});
