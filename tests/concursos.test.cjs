const { test } = require('node:test');
const assert = require('node:assert/strict');
const cn = require('../lib/concursos');
const dataset = require('../content/concursos.json');

// Uma entrada válida mínima, usada como base para os testes negativos.
const good = () => ({
  id: 'sp-santos-exemplo-1-2026',
  orgao: 'Prefeitura Municipal de Santos',
  municipio: 'Santos',
  uf: 'SP',
  banca: 'IBAM',
  edital: 'Edital nº 1/2026',
  status: 'inscricoes_abertas',
  inscricaoInicio: '2026-09-01',
  inscricaoFim: '2026-10-01',
  dataProva: '2026-11-15',
  dataProvaConfirmada: false,
  vagas: 10,
  salarioMin: 2000,
  salarioMax: 3000,
  escolaridade: ['medio'],
  cargos: ['Exemplo'],
  taxaInscricao: 50,
  sourceUrl: 'https://www.ibamsp-concursos.org.br/informacoes/1/',
  editalUrl: null,
  produtos: [],
  resumo: 'Entrada de exemplo usada apenas nos testes.',
  capturedAt: '2026-09-14'
});

test('slugify produz URL estável a partir de nome com acento', () => {
  assert.equal(cn.slugify('São Paulo'), 'sao-paulo');
  assert.equal(cn.slugify('Mogi Mirim'), 'mogi-mirim');
  assert.equal(cn.slugify('Araçariguama'), 'aracariguama');
  assert.equal(cn.slugify('  Caçapava  '), 'cacapava');
});

test('daysBetween conta em dias inteiros e ignora fuso', () => {
  assert.equal(cn.daysBetween('2026-09-13', '2026-09-20'), 7);
  assert.equal(cn.daysBetween('2026-09-20', '2026-09-13'), -7);
  assert.equal(cn.daysBetween('2026-09-13', '2026-09-13'), 0);
  // Atravessa o horário de verão do hemisfério norte sem perder um dia.
  assert.equal(cn.daysBetween('2026-03-01', '2026-04-01'), 31);
  assert.equal(cn.daysBetween('13/09/2026', '2026-09-20'), null);
});

test('brDate não usa Date() e por isso não muda o dia conforme o fuso', () => {
  assert.equal(cn.brDate('2026-10-11'), '11/10/2026');
  assert.equal(cn.brDate('2026-01-01'), '01/01/2026');
  assert.equal(cn.brDate(''), '');
});

test('o aviso de prazo muda de tom conforme o tempo que sobra', () => {
  const com = fim => cn.deadlineNotice({ inscricaoFim: fim }, '2026-09-13');

  assert.equal(com('2026-09-12').tone, 'closed');
  assert.match(com('2026-09-12').text, /encerradas em 12\/09\/2026/);

  assert.equal(com('2026-09-13').tone, 'urgent');
  assert.match(com('2026-09-13').text, /Último dia/);

  assert.equal(com('2026-09-14').tone, 'urgent');
  assert.match(com('2026-09-14').text, /Falta 1 dia/);

  assert.equal(com('2026-09-20').tone, 'urgent');
  assert.match(com('2026-09-20').text, /Faltam 7 dias/);

  // Oito dias já não é urgência: o site não inventa pressão.
  assert.equal(com('2026-09-21').tone, 'open');
  assert.match(com('2026-09-21').text, /Inscrições até 21\/09\/2026/);
});

test('sem data de encerramento o site fica calado em vez de chutar', () => {
  assert.equal(cn.deadlineNotice({ inscricaoFim: null }, '2026-09-13'), null);
  assert.equal(cn.deadlineNotice({ inscricaoFim: 'setembro' }, '2026-09-13'), null);
});

test('status declarado como aberto é rebaixado quando o prazo já passou', () => {
  const base = { status: 'inscricoes_abertas', inscricaoFim: '2026-08-20' };

  // Prazo vencido e prova marcada: vira prova marcada, não continua "abertas".
  assert.equal(cn.effectiveStatus({ ...base, dataProva: '2026-10-11' }, '2026-09-13'), 'prova_marcada');

  // Prazo vencido e sem prova divulgada: apenas encerradas.
  assert.equal(cn.effectiveStatus(base, '2026-09-13'), 'inscricoes_encerradas');

  // Prazo ainda em pé: continua aberto.
  assert.equal(cn.effectiveStatus({ ...base, inscricaoFim: '2026-10-01' }, '2026-09-13'), 'inscricoes_abertas');
});

test('prova que já aconteceu encerra o certame', () => {
  assert.equal(
    cn.effectiveStatus({ status: 'prova_marcada', dataProva: '2026-09-12' }, '2026-09-13'),
    'encerrado'
  );
});

test('status desconhecido não derruba o build, vira previsto', () => {
  assert.equal(cn.effectiveStatus({ status: 'sei-la' }, '2026-09-13'), 'previsto');
});

test('normalize resolve caminho, rótulo e prazo de uma só vez', () => {
  const c = cn.normalize(good(), '2026-09-13');
  assert.equal(c.uf, 'SP');
  assert.equal(c.ufNome, 'São Paulo');
  assert.equal(c.ufSlug, 'sp');
  assert.equal(c.municipioSlug, 'santos');
  assert.equal(c.path, '/concursos/sp/santos');
  assert.equal(c.status, 'inscricoes_abertas');
  assert.equal(c.statusLabel, 'Inscrições abertas');
  assert.equal(c.statusTone, 'open');
  assert.equal(c.deadline.tone, 'open');
  assert.equal(c.diasParaProva, 63);
});

test('groupByUf coloca na frente o estado e a cidade com inscrição aberta', () => {
  const entries = [
    { ...good(), id: 'a', uf: 'RJ', municipio: 'Niterói', status: 'inscricoes_encerradas', inscricaoFim: '2026-01-01', dataProva: null },
    { ...good(), id: 'b', uf: 'SP', municipio: 'Santos', status: 'inscricoes_encerradas', inscricaoFim: '2026-01-01', dataProva: null },
    { ...good(), id: 'c', uf: 'SP', municipio: 'Guarulhos', status: 'inscricoes_abertas' }
  ].map(e => cn.normalize(e, '2026-09-13'));

  const estados = cn.groupByUf(entries);
  assert.deepEqual(estados.map(e => e.uf), ['SP', 'RJ']);
  assert.equal(estados[0].abertos, 1);
  assert.equal(estados[1].abertos, 0);
  // Dentro do estado, a cidade com inscrição aberta vem primeiro.
  assert.deepEqual(estados[0].municipios.map(m => m.municipio), ['Guarulhos', 'Santos']);
});

test('cada município vira um caminho único', () => {
  const entries = dataset.map(e => cn.normalize(e, '2026-09-13'));
  const porCaminho = new Map();
  for (const c of entries) {
    const anterior = porCaminho.get(c.path);
    if (anterior) assert.equal(anterior, c.municipio, `caminho ${c.path} usado por cidades diferentes`);
    porCaminho.set(c.path, c.municipio);
  }
  assert.ok(porCaminho.size > 0);
});

test('entrada sem fonte oficial não entra no site', () => {
  const semFonte = { ...good(), sourceUrl: null };
  assert.match(cn.problems(semFonte).join('\n'), /sem sourceUrl/);

  const fonteInsegura = { ...good(), sourceUrl: 'http://exemplo.gov.br/edital' };
  assert.match(cn.problems(fonteInsegura).join('\n'), /sourceUrl precisa ser https/);
});

test('problems recusa data fora do formato, UF inventada e número impossível', () => {
  assert.match(cn.problems({ ...good(), inscricaoFim: '20/08/2026' }).join('\n'), /inscricaoFim fora do formato/);
  assert.match(cn.problems({ ...good(), uf: 'XX' }).join('\n'), /UF desconhecida/);
  assert.match(cn.problems({ ...good(), vagas: 'muitas' }).join('\n'), /vagas precisa ser número ou null/);
  assert.match(cn.problems({ ...good(), vagas: -3 }).join('\n'), /vagas precisa ser número ou null/);
  assert.match(cn.problems({ ...good(), salarioMin: 5000, salarioMax: 1000 }).join('\n'), /salário máximo menor/);
  assert.match(cn.problems({ ...good(), inscricaoInicio: '2026-10-01', inscricaoFim: '2026-09-01' }).join('\n'), /termina antes de começar/);
  assert.match(cn.problems({ ...good(), resumo: '' }).join('\n'), /falta resumo/);
});

test('data de prova precisa dizer se está confirmada', () => {
  const semFlag = { ...good() };
  delete semFlag.dataProvaConfirmada;
  assert.match(cn.problems(semFlag).join('\n'), /dataProva sem dizer se está confirmada/);
  assert.deepEqual(cn.problems({ ...good(), dataProvaConfirmada: true }), []);
});

test('a base publicada passa inteira na trava de fonte e de data', () => {
  const found = dataset.flatMap(cn.problems);
  assert.deepEqual(found, []);
});

test('nenhum certame publicado aponta para apostila inexistente', () => {
  const catalogo = require('../products/catalog.json');
  for (const c of dataset) {
    for (const slug of c.produtos || []) {
      assert.ok(catalogo[slug], `${c.id} cita apostila inexistente: ${slug}`);
    }
  }
});

// A faixa da home promete três destinos. Um banner que leva a 404 é pior que
// banner nenhum, então cada href é conferido contra o arquivo em disco.
test('cada quadro da faixa da home aponta para uma página que existe', () => {
  const fs = require('node:fs');
  const home = fs.readFileSync('public/index.html', 'utf8');
  const banda = /<!-- banners:start -->([\s\S]*?)<!-- banners:end -->/.exec(home);
  assert.ok(banda, 'a faixa de destaques sumiu da home');

  const hrefs = [...banda[1].matchAll(/class="promo-slide" href="([^"]+)"/g)].map(m => m[1]);
  assert.equal(hrefs.length, 3, 'a faixa deve ter três quadros');
  for (const href of hrefs) {
    assert.ok(href.startsWith('/'), `destino externo na faixa: ${href}`);
    assert.ok(fs.existsSync('public' + href + '.html'), `quadro aponta para página inexistente: ${href}`);
  }
});

test('os atalhos do meio da home também existem em disco', () => {
  const fs = require('node:fs');
  const home = fs.readFileSync('public/index.html', 'utf8');
  const bloco = /<!-- atalhos:start -->([\s\S]*?)<!-- atalhos:end -->/.exec(home);
  assert.ok(bloco, 'o bloco de atalhos sumiu da home');

  const hrefs = [...bloco[1].matchAll(/class="atalho-card" href="([^"]+)"/g)].map(m => m[1]);
  assert.ok(hrefs.length >= 3);
  for (const href of hrefs) {
    assert.ok(fs.existsSync('public' + href + '.html'), `atalho aponta para página inexistente: ${href}`);
  }
});

// O botão de aviso manda uma origem que o servidor confere contra um formato
// fechado. Se os dois deixarem de combinar, o pedido de aviso de Guarulhos
// vira "storefront" em silêncio e a pessoa recebe o e-mail errado — ou nenhum.
test('a origem que o botão envia é a que o servidor aceita', () => {
  const fs = require('node:fs');
  const handler = fs.readFileSync('lib/newsletter-handler.js', 'utf8');
  const aceito = /const source=(\/\^.+?\/)\.test/.exec(handler);
  assert.ok(aceito, 'o handler deixou de validar a origem');
  const regex = new RegExp(aceito[1].slice(1, -1));

  const paginas = [
    ...fs.readdirSync('public/concursos', { recursive: true })
  ].filter(f => String(f).endsWith('.html')).map(f => 'public/concursos/' + f);
  paginas.push('public/concursos.html');

  let encontrados = 0;
  for (const arquivo of paginas) {
    if (!fs.existsSync(arquivo)) continue;
    for (const [, fonte] of fs.readFileSync(arquivo, 'utf8').matchAll(/data-newsletter-fonte="([^"]+)"/g)) {
      assert.ok(regex.test(fonte), `${arquivo} envia origem que o servidor recusa: ${fonte}`);
      encontrados++;
    }
  }
  assert.ok(encontrados > 0, 'nenhuma página de concurso oferece o aviso de edital');
});

// Um número grande na home é o que mais convida ao exagero. Este teste é a
// trava: o total anunciado tem que ser exatamente a soma das vagas dos
// certames abertos da própria base, e os que não declaram vagas não podem ser
// contados como se declarassem zero sem que a home diga isso.
test('o total de vagas da home é a soma da base, não um número redondo', () => {
  const fs = require('node:fs');
  const home = fs.readFileSync('public/index.html', 'utf8');
  const anunciado = /<strong>([\d.]+) vagas com inscrição aberta agora\.<\/strong>/.exec(home);
  assert.ok(anunciado, 'a home deixou de anunciar o total de vagas');

  const abertos = dataset.map(c => cn.normalize(c, '2026-09-14')).filter(c => c.status === 'inscricoes_abertas');
  const soma = abertos.reduce((s, c) => s + (c.vagas || 0), 0);
  assert.equal(Number(anunciado[1].replace(/\./g, '')), soma);

  const semVagas = abertos.filter(c => c.vagas == null).length;
  if (semVagas) {
    assert.match(home, new RegExp(semVagas + ' deles não declaram número de vagas'),
      'a home some com os certames sem vagas declaradas em vez de dizer que existem');
  }
});
