const test = require('node:test');
const assert = require('node:assert');
const { dueStep, daysToExam, recoveryContent } = require('../lib/recovery');
const { catalog } = require('../lib/catalog');

const product = {
  slug: 'banco-x-2026', name: 'Técnico Banco X 2026 + audiobook', shortName: 'Técnico Banco X 2026', examBoard: 'FCC',
  priceCents: 4090, proofPoints: ['PDF com 578 páginas', '1.510 questões comentadas', 'Audiobook em 8 capítulos'],
  storefront: { cover3d: '/assets/capa.png', shortTag: 'Banco X · Técnico' }, exam: { date: '2027-01-24', confirmed: false }
};
const created = (iso) => Math.floor(Date.parse(iso) / 1000);

test('cadência: dia 1, 3 e 6 depois do abandono', () => {
  const s = created('2026-11-10T15:00:00Z');
  assert.equal(dueStep(product, s, new Date('2026-11-11T15:30:00Z')), 'r2');
  assert.equal(dueStep(product, s, new Date('2026-11-13T15:30:00Z')), 'r3');
  assert.equal(dueStep(product, s, new Date('2026-11-16T15:30:00Z')), 'r4');
  assert.equal(dueStep(product, s, new Date('2026-11-12T15:30:00Z')), null);
  assert.equal(dueStep(product, s, new Date('2026-11-20T15:30:00Z')), null);
});

test('lembretes ancorados na prova: 10 e 3 dias antes', () => {
  const s = created('2026-12-20T15:00:00Z');
  assert.equal(dueStep(product, s, new Date('2027-01-14T15:00:00Z')), 'p10');
  assert.equal(dueStep(product, s, new Date('2027-01-21T15:00:00Z')), 'p3');
});

test('nada é enviado depois que a prova passou', () => {
  const s = created('2027-01-20T15:00:00Z');
  assert.equal(dueStep(product, s, new Date('2027-01-27T15:00:00Z')), null);
});

test('dias até a prova no fuso de São Paulo', () => {
  assert.equal(daysToExam(product, new Date('2027-01-14T02:00:00Z')), 11);   // ainda dia 13 em SP
  assert.equal(daysToExam({ exam: null }, new Date()), null);
});

test('cada e-mail fala da apostila abandonada, com preço real e sem "autores IBAM"', () => {
  const ctx = { origin: 'https://www.concursotrilhaaprova.online', now: new Date('2026-11-17T12:00:00Z'), ctaUrl: 'https://x' };
  for (const step of ['r1', 'r2', 'r3', 'r4', 'p10', 'p3', 'pix']) {
    const c = recoveryContent(step, product, { ...ctx, pix: { code: '000201PIX', url: 'https://pix' } });
    assert.ok(c.subject.includes('Banco X') || step === 'r3', step);
    assert.ok(c.body.includes('R$ 40,90'), step + ' preço');
    assert.ok(!/autores|IBAM|24,99/i.test(c.subject + c.body), step + ' sem conteúdo genérico antigo');
    assert.ok(!/de R\$|por R\$|desconto/i.test(c.body), step + ' sem de/por');
  }
  assert.ok(recoveryContent('pix', product, { ...ctx, pix: { code: '000201PIX' } }).body.includes('000201PIX'));
  assert.ok(recoveryContent('r3', product, ctx).subject.startsWith('Faltam 68 dias'));
});

test('todas as apostilas à venda geram os 6 passos sem erro', () => {
  const ctx = { origin: 'https://www.concursotrilhaaprova.online', now: new Date('2026-11-17T12:00:00Z'), ctaUrl: 'https://x' };
  let n = 0;
  for (const p of Object.values(catalog).filter(p => p.active !== false)) {
    for (const step of ['r1', 'r2', 'r3', 'r4']) { const c = recoveryContent(step, p, ctx); assert.ok(c.subject && c.body.length > 200, p.slug + ' ' + step); n++; }
  }
  assert.ok(n > 20);
});
