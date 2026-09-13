/**
 * Testes do vigia de data de prova.
 *
 * A regra que importa aqui não é a contagem de dias: é que desativar uma
 * apostila depois da prova nunca pode tirar o material de quem já pagou por ele.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { examStatus, examWatch, sellable, daysUntil } = require('../lib/exam-watch');
const { catalog, getProduct, getSellableProduct } = require('../lib/catalog');

const apostila = (exam, extra = {}) => Object.assign({ slug: 'x', shortName: 'Apostila X', exam }, extra);
const prova = (date, confirmed = false) => ({ date, confirmed, source: 'Edital nº 73/2026' });

/* --------------------------------------------------------- contagem de dias */

test('conta dias inteiros pelo calendário de Brasília, não pelo relógio do servidor', () => {
  // 23h30 de 10/10 em São Paulo ainda é véspera, mesmo já sendo dia 11 em UTC.
  assert.equal(daysUntil('2026-10-11', new Date('2026-10-11T02:30:00Z')), 1);
  assert.equal(daysUntil('2026-10-11', new Date('2026-10-11T12:00:00Z')), 0);
  assert.equal(daysUntil('2026-10-11', new Date('2026-10-12T12:00:00Z')), -1);
});

test('data ausente ou inválida não vira dia zero', () => {
  assert.equal(daysUntil(null), null);
  assert.equal(daysUntil('11/10/2026'), null);
  assert.equal(daysUntil('2026-13-40'), null);
});

/* ------------------------------------------------------------- os estágios */

test('prova distante não incomoda quem está vendendo', () => {
  const s = examStatus(apostila(prova('2026-10-11')), new Date('2026-06-01T12:00:00Z'));
  assert.equal(s.stage, 'preparacao');
  assert.equal(s.severity, 'ok');
  assert.equal(s.daysLeft, 132);
});

test('a 45 dias o painel começa a avisar', () => {
  const s = examStatus(apostila(prova('2026-10-11')), new Date('2026-08-27T12:00:00Z'));
  assert.equal(s.stage, 'reta-final');
  assert.equal(s.severity, 'atencao');
  assert.match(s.action, /2026|11\/10\/2026/);
});

test('na última semana o aviso vira urgente e diz quantos dias de estudo sobram', () => {
  const s = examStatus(apostila(prova('2026-10-11')), new Date('2026-10-08T12:00:00Z'));
  assert.equal(s.stage, 'semana');
  assert.equal(s.severity, 'critico');
  assert.equal(s.daysLeft, 3);
  assert.match(s.action, /3 dias de estudo/);
});

test('falta 1 dia, não faltam 1 dias', () => {
  const s = examStatus(apostila(prova('2026-10-11')), new Date('2026-10-10T12:00:00Z'));
  assert.match(s.headline, /Falta 1 dia para a prova/);
});

test('no dia da prova o painel pede a desativação para o dia seguinte', () => {
  const s = examStatus(apostila(prova('2026-10-11')), new Date('2026-10-11T12:00:00Z'));
  assert.equal(s.stage, 'hoje');
  assert.equal(s.severity, 'critico');
  assert.match(s.headline, /hoje, 11\/10\/2026/);
});

test('prova passada com apostila ainda no ar é o alerta mais forte', () => {
  const s = examStatus(apostila(prova('2026-10-11')), new Date('2026-10-14T12:00:00Z'));
  assert.equal(s.stage, 'encerrado');
  assert.equal(s.severity, 'critico');
  assert.match(s.headline, /há 3 dias/);
  assert.match(s.action, /quem já comprou continua com acesso/i);
});

test('prova passada com apostila já desativada não fica cobrando decisão', () => {
  const s = examStatus(apostila(prova('2026-10-11'), { active: false }), new Date('2026-10-14T12:00:00Z'));
  assert.equal(s.severity, 'ok');
  assert.equal(s.active, false);
});

test('sem data cadastrada o painel pede o dado em vez de inventar uma', () => {
  const s = examStatus(apostila(null), new Date('2026-06-01T12:00:00Z'));
  assert.equal(s.stage, 'sem-data');
  assert.equal(s.daysLeft, null);
  assert.match(s.action, /edital/i);
});

test('data não confirmada é dita, não escondida', () => {
  const aberta = examStatus(apostila(prova('2026-10-11', false)), new Date('2026-09-20T12:00:00Z'));
  const firme = examStatus(apostila(prova('2026-10-11', true)), new Date('2026-09-20T12:00:00Z'));
  assert.match(aberta.action, /não está confirmada/);
  assert.doesNotMatch(firme.action, /não está confirmada/);
});

/* ------------------------------------------------------------- a ordenação */

test('o que exige decisão hoje aparece antes do que pode esperar', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  const ordem = examWatch({
    tranquila: apostila(prova('2027-05-10'), { slug: 'tranquila', shortName: 'Tranquila' }),
    vencida: apostila(prova('2026-09-01'), { slug: 'vencida', shortName: 'Vencida' }),
    sem: apostila(null, { slug: 'sem', shortName: 'Sem data' }),
    hoje: apostila(prova('2026-10-11'), { slug: 'hoje', shortName: 'Hoje' })
  }, now).map((e) => e.slug);
  assert.deepEqual(ordem, ['vencida', 'hoje', 'sem', 'tranquila']);
});

/* ---------------------------------------------- vender ≠ entregar */

test('depois da prova a apostila para de ser vendida', () => {
  const p = apostila(prova('2026-10-11'));
  assert.equal(sellable(p, new Date('2026-10-11T12:00:00Z')), true, 'no dia da prova ainda vale comprar');
  assert.equal(sellable(p, new Date('2026-10-12T12:00:00Z')), false);
});

test('apostila desativada some da venda mas continua sendo entregue a quem comprou', () => {
  const slug = 'agente-de-portaria-ibam-santos-2026';
  const original = catalog[slug].active;
  try {
    catalog[slug].active = false;
    assert.equal(getSellableProduct(slug), null, 'não pode iniciar um novo checkout');
    assert.equal(getProduct(slug)?.slug, slug, 'quem já pagou continua acessando PDF e audiobook');
  } finally {
    catalog[slug].active = original;
  }
});

test('a prova encerrada também não pode derrubar a entrega de quem comprou antes', () => {
  const slug = 'agente-de-portaria-ibam-santos-2026';
  const depois = new Date('2027-01-01T12:00:00Z');
  assert.equal(getSellableProduct(slug, depois), null);
  assert.equal(getProduct(slug)?.slug, slug);
});

/* --------------------------------------------------- o catálogo de verdade */

test('toda apostila do catálogo responde ao vigia sem quebrar', () => {
  const rows = examWatch(catalog);
  assert.equal(rows.length, Object.keys(catalog).length);
  for (const row of rows) {
    assert.ok(row.name, 'toda linha do painel precisa de um nome legível');
    assert.ok(row.headline && row.action, `${row.slug} precisa dizer o que está acontecendo e o que fazer`);
    assert.ok(['ok', 'atencao', 'critico'].includes(row.severity));
  }
});

test('data de prova cadastrada sempre vem com a fonte que a sustenta', () => {
  for (const product of Object.values(catalog)) {
    if (!product.exam) continue;
    assert.match(product.exam.date, /^\d{4}-\d{2}-\d{2}$/, `${product.slug}: data em formato inválido`);
    assert.ok(product.exam.source, `${product.slug}: data de prova sem fonte documental`);
  }
});
