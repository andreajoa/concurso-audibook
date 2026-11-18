const test = require('node:test');
const assert = require('node:assert/strict');
const { inscricoesTexto, sellable } = require('../lib/exam-watch');

test('inscrições com data final vencida viram "encerradas"', () => {
  assert.equal(inscricoesTexto('até 18/11/2026', '2026-11-19'), 'encerradas em 18/11/2026');
  assert.equal(inscricoesTexto('09/11 a 09/12/2026', '2026-12-10'), 'encerradas em 09/12/2026');
});

test('no último dia e antes dele, o texto original continua', () => {
  assert.equal(inscricoesTexto('até 18/11/2026', '2026-11-18'), 'até 18/11/2026');
  assert.equal(inscricoesTexto('28/10 a 10/12/2026', '2026-11-18'), '28/10 a 10/12/2026');
});

test('textos sem data ou já encerrados não mudam', () => {
  assert.equal(inscricoesTexto('edital ainda não publicado', '2027-01-01'), 'edital ainda não publicado');
  assert.equal(inscricoesTexto('encerradas', '2027-01-01'), 'encerradas');
  assert.equal(inscricoesTexto(null, '2027-01-01'), null);
});

test('Santos e Matão Assistente saem da venda no dia seguinte à prova', () => {
  const catalog = require('../products/catalog.json');
  const santos = catalog['professor-adjunto-i-ibam-santos-2026'];
  const matao = catalog['matao-sp-assistente-administrativo-2026'];
  assert.equal(sellable(santos, new Date('2026-11-29T12:00:00Z')), true);
  assert.equal(sellable(santos, new Date('2026-11-30T12:00:00Z')), false);
  assert.equal(sellable(matao, new Date('2026-12-06T12:00:00Z')), true);
  assert.equal(sellable(matao, new Date('2026-12-07T12:00:00Z')), false);
});

test('Kit Base a R$ 49,90', () => {
  assert.equal(require('../products/catalog.json')['kit-base-plano-de-estudos'].priceCents, 4990);
});
