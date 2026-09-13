/**
 * Testes das ferramentas gratuitas.
 *
 * O que se testa aqui não é interface: é a aritmética que alguém vai usar para
 * decidir o que estudar. Conta errada numa calculadora de concurso manda a
 * pessoa para a matéria errada, e ela só descobre no dia da prova.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseEdital, computeCronograma, computeAcertos, hhmm } = require('../public/ferramentas.js');

/* -------------------------------------------------- edital verticalizado */

test('separa disciplina de tópico no formato que os editais usam', () => {
  const groups = parseEdital(
    'LÍNGUA PORTUGUESA:\nInterpretação de texto; Ortografia oficial; Acentuação gráfica.\n' +
    'RACIOCÍNIO LÓGICO:\nProposições; Tabelas-verdade.'
  );

  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, 'LÍNGUA PORTUGUESA');
  assert.deepEqual(groups[0].items.map((i) => i.text), ['Interpretação de texto', 'Ortografia oficial', 'Acentuação gráfica']);
  assert.equal(groups[1].name, 'RACIOCÍNIO LÓGICO');
  assert.equal(groups[1].items.length, 2);
  assert.equal(groups[0].items[0].done, false);
});

test('aceita disciplina em caixa mista terminada em dois-pontos', () => {
  const groups = parseEdital('Noções de Direito Administrativo:\nPrincípios; Atos administrativos.');
  assert.equal(groups[0].name, 'Noções de Direito Administrativo');
  assert.equal(groups[0].items.length, 2);
});

test('texto sem cabeçalho vira um grupo único em vez de sumir', () => {
  const groups = parseEdital('Interpretação de texto; Ortografia; Crase.');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Conteúdo programático');
  assert.equal(groups[0].items.length, 3);
});

test('não cria tópico vazio a partir de pontuação solta', () => {
  const groups = parseEdital('PORTUGUÊS:\nCrase;; Regência;  ; Pontuação.');
  assert.deepEqual(groups[0].items.map((i) => i.text), ['Crase', 'Regência', 'Pontuação']);
});

test('preserva a numeração que o próprio edital traz', () => {
  const groups = parseEdital('MATEMÁTICA:\n1. Conjuntos; 2. Funções; 2.1 Função afim.');
  assert.deepEqual(groups[0].items.map((i) => i.text), ['1. Conjuntos', '2. Funções', '2.1 Função afim']);
});

test('entrada vazia não gera lista falsa', () => {
  assert.deepEqual(parseEdital(''), []);
  assert.deepEqual(parseEdital('   \n  \n'), []);
});

/* ----------------------------------------------------------- cronograma */

test('distribui as horas na proporção de questões vezes peso', () => {
  const r = computeCronograma(
    [{ nome: 'Português', questoes: 20, peso: 2 }, { nome: 'Informática', questoes: 5, peso: 1 }],
    10, 5, 20
  );

  // peso real: 40 e 5, total 45. Conteúdo = 8h (10h menos 20% de revisão).
  assert.equal(r.total, 45);
  assert.equal(r.horasRevisao, 2);
  assert.equal(r.horasConteudo, 8);
  assert.ok(Math.abs(r.itens[0].horas - 8 * (40 / 45)) < 1e-9);
  assert.ok(Math.abs(r.itens[1].horas - 8 * (5 / 45)) < 1e-9);
});

test('a soma das horas por disciplina fecha com o tempo de conteúdo', () => {
  const r = computeCronograma(
    [{ nome: 'A', questoes: 7, peso: 3 }, { nome: 'B', questoes: 11, peso: 1 }, { nome: 'C', questoes: 4, peso: 2 }],
    13, 6, 25
  );
  const soma = r.itens.reduce((s, i) => s + i.horas, 0);
  assert.ok(Math.abs(soma - r.horasConteudo) < 1e-9, 'nenhuma hora pode sumir no rateio');
});

test('ordena da disciplina que mais pesa para a que menos pesa', () => {
  const r = computeCronograma(
    [{ nome: 'Leve', questoes: 5, peso: 1 }, { nome: 'Pesada', questoes: 20, peso: 2 }, { nome: 'Média', questoes: 10, peso: 1 }],
    10, 5, 20
  );
  assert.deepEqual(r.itens.map((i) => i.nome), ['Pesada', 'Média', 'Leve']);
});

test('peso ausente é tratado como 1 em vez de zerar a disciplina', () => {
  const r = computeCronograma([{ nome: 'Português', questoes: 10, peso: '' }], 10, 5, 0);
  assert.equal(r.total, 10);
  assert.equal(r.itens[0].horas, 10);
});

test('sem revisão, todo o tempo vai para conteúdo', () => {
  const r = computeCronograma([{ nome: 'A', questoes: 10, peso: 1 }], 8, 4, 0);
  assert.equal(r.horasRevisao, 0);
  assert.equal(r.horasConteudo, 8);
  assert.equal(r.itens[0].porDia, 2);
});

test('quadro sem questão nenhuma não produz cronograma inventado', () => {
  assert.equal(computeCronograma([{ nome: 'A', questoes: 0, peso: 2 }], 10, 5, 20), null);
  assert.equal(computeCronograma([], 10, 5, 20), null);
});

/* ------------------------------------------------------------- acertos */

test('conta pontos pelo peso, não pelo número de questões', () => {
  const r = computeAcertos(
    [{ nome: 'Português', questoes: 20, peso: 2, minimo: '', acertos: 10 },
      { nome: 'Informática', questoes: 5, peso: 1, minimo: '', acertos: 3 }],
    50
  );
  assert.equal(r.pontos, 23);          // 10×2 + 3×1
  assert.equal(r.maximo, 45);          // 20×2 + 5×1
  assert.equal(r.potencial, 22);       // 10×2 + 2×1
  assert.equal(r.faltam, 27);
});

test('avisa quando nem acertando tudo o alvo é alcançável', () => {
  const r = computeAcertos([{ nome: 'A', questoes: 10, peso: 1, minimo: '', acertos: 2 }], 40);
  assert.equal(r.alcancavel, false);
  assert.deepEqual(r.rota, [], 'não faz sentido traçar rota para meta impossível');
});

test('a rota até o alvo começa onde cada acerto vale mais ponto', () => {
  const r = computeAcertos(
    [{ nome: 'Peso baixo', questoes: 20, peso: 1, minimo: '', acertos: 0 },
      { nome: 'Peso alto', questoes: 10, peso: 3, minimo: '', acertos: 0 }],
    12
  );
  assert.equal(r.rota[0].nome, 'Peso alto');
  assert.equal(r.rota[0].acertos, 4);   // 4 × 3 = 12 pontos
  assert.equal(r.rota.length, 1);
});

test('a rota soma pelo menos o que falta, sem prometer menos esforço', () => {
  const r = computeAcertos(
    [{ nome: 'A', questoes: 4, peso: 3, minimo: '', acertos: 0 },
      { nome: 'B', questoes: 20, peso: 1, minimo: '', acertos: 0 }],
    20
  );
  const somaRota = r.rota.reduce((s, p) => s + p.pontos, 0);
  assert.ok(somaRota >= r.faltam, 'a rota não pode ficar aquém do alvo');
});

test('marca risco de eliminação por nota mínima, mesmo com pontuação alta', () => {
  const r = computeAcertos(
    [{ nome: 'Português', questoes: 20, peso: 3, minimo: 10, acertos: 19 },
      { nome: 'Lógica', questoes: 10, peso: 1, minimo: 5, acertos: 2 }],
    50
  );
  assert.ok(r.pontos > r.alvo, 'a pontuação total está acima do alvo');
  assert.equal(r.risco.length, 1);
  assert.equal(r.risco[0].nome, 'Lógica');
  assert.equal(r.risco[0].faltamMinimo, 3);
});

test('disciplina sem nota mínima não vira alerta falso', () => {
  const r = computeAcertos([{ nome: 'A', questoes: 10, peso: 1, minimo: '', acertos: 0 }], 5);
  assert.equal(r.risco.length, 0);
  assert.equal(r.itens[0].minimo, null);
});

test('acertos acima do total de questões são limitados ao possível', () => {
  const r = computeAcertos([{ nome: 'A', questoes: 10, peso: 2, minimo: '', acertos: 99 }], 10);
  assert.equal(r.itens[0].acertos, 10);
  assert.equal(r.pontos, 20);
  assert.equal(r.potencial, 0);
});

test('alvo já atingido é reportado como folga, não como falta', () => {
  const r = computeAcertos([{ nome: 'A', questoes: 10, peso: 1, minimo: '', acertos: 8 }], 5);
  assert.equal(r.faltam, -3);
  assert.deepEqual(r.rota, []);
});

test('quadro vazio não produz resultado', () => {
  assert.equal(computeAcertos([], 50), null);
  assert.equal(computeAcertos([{ nome: 'A', questoes: 0, peso: 1, minimo: '', acertos: 0 }], 50), null);
});

/* ------------------------------------------------------------ formatação */

test('formata hora de um jeito que cabe numa agenda real', () => {
  assert.equal(hhmm(2), '2h');
  assert.equal(hhmm(0.5), '30 min');
  assert.equal(hhmm(1.75), '1h45');
  assert.equal(hhmm(2.1), '2h06');
});
