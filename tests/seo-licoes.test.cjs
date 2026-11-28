const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../lib/seo-licoes.js');

const pagina = ({ title = 'Apostila Guarda Municipal de Campinas 2026 | Trilha', h1 = 'Guarda Municipal de Campinas: 100 vagas', description = 'Apostila da GCM Campinas pelo edital da VUNESP, com questões comentadas e audiobook.', corpo = '' } = {}) =>
  `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"></head><body>` +
  '<header class="portal-site-header"><nav><a href="/apostilas-para-concurso">Apostilas para concurso</a><a href="/apostilas-para-concurso">Apostila para concurso</a><a href="/x">Comprar apostila para concurso</a></nav></header>' +
  `<section class="combo-hero"><h1>${h1}</h1></section><main>${corpo}</main>` +
  '<footer class="site-footer"><p>apostila para concurso, apostila para concurso, apostila para concurso</p></footer></body></html>';

const fichaValida = () => ({
  slug: 'guarda-municipal-campinas-2026',
  data: '2026-11-26',
  consultaPrincipal: 'apostila guarda municipal campinas',
  concorrentes: [
    { url: 'https://www.exemplo-um.com.br/apostila-gcm', titulo: 'Apostila GCM', cobre: ['vagas', 'salário'] },
    { url: 'https://www.exemplo-dois.com.br/gcm', titulo: 'GCM Campinas', cobre: ['conteúdo'] },
    { url: 'https://www.exemplo-tres.com.br/gcm', titulo: 'Concurso GCM', cobre: ['data da prova'] }
  ],
  caudaLonga: [
    { consulta: 'apostila gcm campinas pdf', fonte: 'autocomplete' },
    { consulta: 'apostila guarda municipal campinas vunesp', fonte: 'buscas-relacionadas' },
    { consulta: 'o que cai na prova da gcm campinas', fonte: 'pessoas-tambem-perguntam' },
    { consulta: 'gcm campinas salario', fonte: 'pessoas-tambem-perguntam' },
    { consulta: 'concurso gcm campinas 2026', fonte: 'google-trends' }
  ],
  lacunas: [
    { pergunta: 'Quantas vagas?', resposta: '100 vagas', fonte: 'Edital 02/2026, item 1' },
    { pergunta: 'Qual o salário?', resposta: 'R$ 4.030,08', fonte: 'Edital 02/2026, item 2.1' },
    { pergunta: 'Qual a banca?', resposta: 'Fundação VUNESP', fonte: 'Edital 02/2026, preâmbulo' }
  ]
});

test('página escrita como gente fala passa, e a moldura do site (menu e rodapé) não conta', () => {
  const html = pagina({ corpo: '<p class="answer">A apostila para concurso da GCM Campinas segue o edital da Fundação VUNESP: 100 vagas e salário de R$ 4.030,08.</p><h2>O que vem</h2><p>PDF, simulados e audiobook.</p>' });
  assert.deepEqual(L.checarExcesso(html), []);
});

test('o vídeo que manda pôr a palavra-chave em todo H2 e FAQ é barrado', () => {
  const secoes = ['O que é', 'Preço', 'Conteúdo', 'Entrega', 'Dúvidas']
    .map((s) => `<h2>Apostila para concurso: ${s}</h2><p>Texto sobre ${s.toLowerCase()} do material.</p>`).join('');
  const problemas = L.checarExcesso(pagina({ corpo: secoes }));
  assert.ok(problemas.some((p) => /5 de 5 subtítulos repetem "apostila para concurso"/.test(p)), problemas.join('\n'));
});

test('frase de busca repetida no mesmo parágrafo e acima do limite da página é barrada', () => {
  const p = '<p>Comprar apostila para concurso é fácil: a apostila para concurso chega na hora e toda apostila para concurso tem audiobook.</p>';
  const problemas = L.checarExcesso(pagina({ corpo: p + '<p>Mais uma apostila para concurso.</p><p>E outra apostila pra concurso.</p>' }));
  assert.ok(problemas.some((x) => /um mesmo parágrafo repete "apostila para concurso" 3 vezes/.test(x)), problemas.join('\n'));
  assert.ok(problemas.some((x) => /"apostila para concurso" aparece 5 vezes/.test(x)), problemas.join('\n'));
});

test('title, H1 e description com a mesma palavra em excesso são barrados', () => {
  const problemas = L.checarExcesso(pagina({
    title: 'Apostila GCM apostila Campinas apostila PDF | Trilha',
    h1: 'Concurso concurso concurso GCM',
    description: 'Apostila GCM, apostila PDF, apostila VUNESP, apostila com audiobook e questões.'
  }));
  assert.ok(problemas.some((p) => p.startsWith('title repete "apostila" 3 vezes')));
  assert.ok(problemas.some((p) => p.startsWith('h1 repete "concurso" 3 vezes')));
  assert.ok(problemas.some((p) => p.startsWith('meta description repete "apostila" 4 vezes')));
});

test('a consulta principal casa com preposição no meio e sem acento', () => {
  const re = L.fraseRegex('Apostila Guarda Municipal Campinas');
  assert.equal(L.contar(L.norm('Apostila da Guarda Municipal de Campinas, apostila guarda municipal campinas'), re), 2);
  assert.equal(L.contar(L.norm('Apostila para Guarda de Sorocaba'), re), 0);
});

test('ficha completa é aceita', () => {
  assert.deepEqual(L.validarFicha(fichaValida(), 'guarda-municipal-campinas-2026'), []);
});

test('ficha sem pesquisa de verdade é recusada com o que falta', () => {
  const f = fichaValida();
  f.concorrentes = f.concorrentes.slice(0, 1).concat([{ url: 'https://www.concursotrilhaaprova.online/x', cobre: ['a'] }]);
  f.caudaLonga[0].fonte = 'chute';
  f.lacunas[0].resposta = 'inscrições abertas';
  f.lacunas[1].fonte = '';
  f.geo = [{ data: '2026-12-10', plataforma: 'chatgpt', pergunta: 'melhor apostila gcm campinas?' }];
  const p = L.validarFicha(f, 'outro-slug');
  for (const esperado of [/slug "guarda-municipal-campinas-2026" difere/, /concorrentes: 2 de no mínimo 3/, /aponta para o próprio site/,
    /caudaLonga\[0\] com fonte "chute"/, /lacunas\[0\] usa situação que muda com a data/, /lacunas\[1\] sem fonte/, /geo\[0\] sem trilhaAparece/]) {
    assert.ok(p.some((x) => esperado.test(x)), `faltou ${esperado}:\n${p.join('\n')}`);
  }
});

test('lacuna sem resposta na página é apontada, sem ligar para acento e caixa', () => {
  const texto = L.textoDaPagina(pagina({ corpo: '<p>São 100 VAGAS, banca Fundação Vunesp.</p>' }));
  assert.deepEqual(L.respostasAusentes(fichaValida(), texto), ['Qual o salário?']);
});

test('consulta principal precisa estar no title ou no H1', () => {
  assert.deepEqual(L.consultaFora(fichaValida(), pagina()), []);
  assert.deepEqual(L.consultaFora({ consultaPrincipal: 'comprar apostila gcm sorocaba' }, pagina()), ['gcm', 'sorocaba']);
});

test('o build roda a trava e as fichas ficam no lugar combinado', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts.build, /npm run verify:seo && npm run verify:seo-licoes/);
  assert.equal(pkg.scripts['verify:seo-licoes'], 'node scripts/verify-seo-licoes.mjs');
  const catalog = JSON.parse(fs.readFileSync('products/catalog.json', 'utf8'));
  const { slugs } = JSON.parse(fs.readFileSync('content/seo-pesquisa/_dispensadas.json', 'utf8'));
  assert.ok(slugs.length > 0);
  for (const s of slugs) assert.ok(catalog[s], `_dispensadas.json cita ${s}, que não está no catálogo`);
  assert.ok(fs.existsSync('docs/seo-geo-pos-apostila.md'));
});
