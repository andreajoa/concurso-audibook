const { test } = require('node:test');
const assert = require('node:assert/strict');
const editorial = require('../lib/editorial');
const backlog = require('../content/editorial-backlog.json');

// Uma matéria que passa em tudo, usada como base para os testes negativos.
const good = () => ({
  title: 'Como montar cronograma de estudo para concurso',
  metaTitle: 'Cronograma de estudo para concurso',
  description: 'Aprenda a transformar o conteúdo programático do edital em um cronograma semanal realista, com peso por disciplina e espaço fixo para revisão.',
  lead: 'Um cronograma de estudo serve para decidir antes o que você vai fazer, não para registrar depois o que deu tempo. Ele nasce do conteúdo programático do edital e precisa de três informações: quantas horas você tem, quantas disciplinas existem e quais delas pesam mais na nota.',
  keyFacts: [['Ponto de partida', 'O conteúdo programático do edital'], ['Unidade de planejamento', 'A semana, não o dia'], ['Espaço mínimo de revisão', 'Um bloco fixo por semana'], ['Erro mais comum', 'Planejar mais horas do que existem']],
  sections: Array.from({ length: 4 }, (_, i) => ({
    h2: `Etapa ${i + 1} do planejamento`,
    html: '<p>' + 'Você precisa decidir o que entra na semana antes de começar a estudar, porque a decisão tomada no cansaço tende a escolher a disciplina mais confortável. '.repeat(6) +
      '</p><p>Veja também <a href="/como-estudar-para-concurso-do-zero">como começar do zero</a> e o <a href="/glossario-concursos-publicos">glossário do edital</a>.</p>'
  })),
  faq: [
    { q: 'Quantas horas por dia preciso estudar?', a: 'Não existe número universal. O que define o cronograma é a quantidade de horas que você consegue sustentar todas as semanas, e não a que você consegue em uma semana boa.' },
    { q: 'Devo estudar todas as disciplinas por semana?', a: 'Não necessariamente. Disciplinas com mais questões merecem presença semanal; as de menor peso podem entrar em blocos quinzenais sem prejuízo.' },
    { q: 'E quando o cronograma atrasa?', a: 'Atraso é informação, não fracasso. Ajuste o volume da semana seguinte em vez de acumular pendência, porque pendência acumulada é o que faz as pessoas abandonarem o plano.' }
  ]
});

test('a validação aprova uma matéria completa e coerente', () => {
  const check = editorial.validateArticle(good(), {
    published: [],
    allowedPaths: ['/como-estudar-para-concurso-do-zero', '/glossario-concursos-publicos']
  });
  assert.deepEqual(check.problems, []);
  assert.equal(check.ok, true);
  assert.equal(check.slug, 'como-montar-cronograma-de-estudo-para-concurso');
});

test('afirmação factual sobre certame reprova a matéria', () => {
  const claims = [
    'As inscrições abertas vão até o fim do mês.',
    'O salário inicial é de R$ 4.200,00 para o cargo.',
    'A prova será em 15 de março, conforme o cronograma.',
    'O edital nº 01/2026 traz 120 oportunidades.',
    'Segundo pesquisa recente, a maioria não termina o conteúdo.',
    'Este material garante aprovação em qualquer banca.',
    'Há vagas abertas para nível médio neste momento.'
  ];
  for (const claim of claims) {
    const article = good();
    article.sections[0].html = `<p>${claim}</p>` + article.sections[0].html;
    const check = editorial.validateArticle(article, { published: [], allowedPaths: [] });
    assert.equal(check.ok, false, `deveria reprovar: ${claim}`);
  }
});

test('a mesma afirmação negada é permitida, porque é o que o site precisa dizer', () => {
  const text = 'Não divulgamos vagas abertas nem informamos salário de R$ para nenhum cargo; sem data de prova confirmada, o edital é a única fonte.';
  assert.deepEqual(editorial.factualProblems(text), []);
});

test('link quebrado, externo ou com .html reprova', () => {
  for (const href of ['/contato.html', 'https://outro-site.com/x', '/rota-que-nao-existe']) {
    const article = good();
    article.sections[0].html = `<p><a href="${href}">link</a></p>` + article.sections[0].html;
    const check = editorial.validateArticle(article, {
      published: [],
      allowedPaths: ['/como-estudar-para-concurso-do-zero', '/glossario-concursos-publicos']
    });
    assert.equal(check.ok, false, `deveria reprovar o link ${href}`);
  }
});

test('matéria curta, com título que não cabe na SERP ou repetida reprova', () => {
  const short = good();
  short.sections = short.sections.slice(0, 1);
  assert.equal(editorial.validateArticle(short, {}).ok, false);

  const longTitle = good();
  longTitle.metaTitle = 'Um título absurdamente longo que jamais caberia inteiro na página de resultados do Google';
  assert.ok(editorial.validateArticle(longTitle, {}).problems.some((p) => /sufixo da marca/.test(p)));

  const repeated = good();
  const check = editorial.validateArticle(repeated, {
    published: [{ slug: 'como-montar-cronograma-de-estudo-para-concurso', title: repeated.title, description: repeated.description }],
    allowedPaths: ['/como-estudar-para-concurso-do-zero', '/glossario-concursos-publicos']
  });
  assert.equal(check.ok, false);
});

test('markup fora da lista branca reprova', () => {
  const article = good();
  article.sections[0].html = '<script>alert(1)</script>' + article.sections[0].html;
  assert.ok(editorial.validateArticle(article, {}).problems.some((p) => /tag não permitida/.test(p)));
});

test('a fila publica sem repetir pauta e garante rodízio regional', () => {
  const published = [];
  const seen = new Set();
  const order = [];
  for (let week = 0; week < backlog.length; week++) {
    const topic = editorial.pickTopic(backlog, published);
    assert.ok(topic, 'a fila não deveria acabar antes do fim do backlog');
    assert.ok(!seen.has(topic.id), 'pauta repetida');
    seen.add(topic.id);
    order.push(topic.scope);
    published.push({ topicId: topic.id, slug: 'x' + week });
  }
  assert.equal(seen.size, backlog.length);
  // A terceira publicação já tem de ser regional: é o que impede o conteúdo da
  // Baixada Santista de ficar todo para o fim do ano, que é justamente o
  // conteúdo com chance real de ranquear no curto prazo.
  assert.notEqual(order[2], 'nacional');
  const regionalTotal = backlog.filter((t) => t.scope !== 'nacional').length;
  assert.equal(order.filter((s) => s !== 'nacional').length, regionalTotal);
  assert.ok(order.slice(0, 9).filter((s) => s !== 'nacional').length >= 3,
    'o regional precisa sair nas primeiras semanas, não no fim da fila');
  assert.equal(editorial.pickTopic(backlog, published), null);
});

test('o parse aceita a resposta mesmo dentro de cerca de código', () => {
  const parsed = editorial.parseArticle('Claro!\n```json\n{"title":"x"}\n```\n');
  assert.equal(parsed.title, 'x');
  assert.throws(() => editorial.parseArticle('sem json aqui'));
});

test('o prompt proíbe explicitamente afirmar vaga, data e salário', () => {
  const prompt = editorial.buildPrompt(backlog[0], { guides: [{ slug: 'g', title: 'G' }] });
  for (const rule of ['NÃO afirme que existe concurso aberto', 'salário', 'data de prova', 'NÃO prometa aprovação']) {
    assert.ok(prompt.includes(rule), `o prompt precisa conter: ${rule}`);
  }
  assert.ok(prompt.includes('/g — G'), 'o prompt precisa listar os caminhos internos permitidos');
});
