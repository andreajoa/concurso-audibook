/**
 * Redação autônoma: a lógica que decide o que é publicado.
 *
 * Tudo aqui é puro — sem rede, sem disco — porque estas são as regras que
 * separam "matéria nova toda semana" de "o site começou a inventar concurso".
 * O worker (api/editorial-cron.js) só orquestra; quem aprova ou reprova um
 * texto é este arquivo, e ele roda nos testes.
 *
 * A premissa que governa o desenho: um modelo de linguagem NÃO sabe qual
 * concurso está aberto hoje. Ele não tem acesso ao Diário Oficial nem ao site
 * da banca. Se a pauta pedir "concursos em alta", ele vai gerar vaga, data e
 * salário plausíveis e falsos. Por isso as pautas são de preparação (perenes) e
 * qualquer afirmação factual sobre certame é motivo de rejeição, não de
 * correção — o texto é descartado e a semana fica sem publicar.
 */

const MIN_WORDS = 750;
const MAX_TITLE = 70;
const BRAND_SUFFIX = ' | Trilha Aprova';

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

const slugify = (s) => String(s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 70)
  .replace(/-+$/, '');

const words = (s) => String(s).replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;

/* ------------------------------------------------------------------ *
 * Seleção de pauta
 * ------------------------------------------------------------------ *
 * Sem repetir e sem deixar a Baixada Santista sumir da fila. O backlog é
 * majoritariamente nacional, então uma escolha puramente sequencial publicaria
 * todo o conteúdo nacional primeiro e o regional só no fim do ano — justamente
 * o oposto do que interessa, porque é no regional que o site tem chance real de
 * ranquear no curto prazo. A cada 3 publicações, uma é forçadamente regional.
 */

function pickTopic(backlog, published) {
  const used = new Set(published.map((a) => a.topicId));
  const available = backlog.filter((t) => !used.has(t.id));
  if (!available.length) return null;

  const regionalTurn = published.length % 3 === 2;
  const regional = available.filter((t) => t.scope !== 'nacional');
  const pool = regionalTurn && regional.length ? regional : available;

  // Determinístico: a mesma fila produz sempre a mesma próxima pauta, o que
  // torna a publicação reproduzível e o teste possível.
  return pool[0];
}

/* ------------------------------------------------------------------ *
 * Prompt
 * ------------------------------------------------------------------ */

function buildPrompt(topic, context) {
  const { products = [], guides = [], cities = [], articles = [] } = context || {};

  const internalLinks = [
    ...guides.map((g) => `/${g.slug} — ${g.title}`),
    ...cities.map((c) => `/${c.slug} — Concursos públicos em ${c.city}`),
    ...products.map((p) => `/apostilas/${p.slug} — ${p.shortName}`),
    ...articles.slice(-8).map((a) => `/materias/${a.slug} — ${a.title}`),
    '/apostilas-para-concurso — catálogo de apostilas',
    '/perguntas-frequentes — central de dúvidas',
    '/sobre — quem escreve os materiais'
  ].join('\n');

  return `Você escreve para a Trilha Aprova, uma editora digital independente de apostilas para concursos públicos no Brasil, com foco também na Baixada Santista (Santos, São Vicente, Guarujá, Praia Grande, Cubatão).

Escreva UMA matéria completa sobre a pauta abaixo.

PAUTA
Título de referência: ${topic.title}
Abordagem: ${topic.angle}
Palavra-chave principal: ${topic.keyword}
Alcance: ${topic.scope === 'nacional' ? 'Brasil inteiro' : 'Baixada Santista, litoral de São Paulo'}
Formato: ${topic.type}

REGRAS INEGOCIÁVEIS (violar qualquer uma faz o texto ser descartado sem publicação)
1. NÃO afirme que existe concurso aberto, vaga, edital publicado, inscrição, data de prova, prazo, salário, remuneração ou nota de corte. Você não tem como saber isso. Escreva sobre método, critério e preparação.
2. NÃO cite número de edital, ano de certame futuro nem nome de concurso como se estivesse em andamento.
3. NÃO invente estatística, percentual, pesquisa, estudo ou "segundo especialistas". Se não pode ser verificado, não entra.
4. NÃO prometa aprovação, nem sugira que o material garante resultado.
5. NÃO escreva depoimento, avaliação, nota ou número de aprovados.
6. Quando precisar falar de vaga ou data, fale sempre para remeter ao edital oficial ("o edital é a única fonte válida"), nunca para informar.

COMO ESCREVER
- Português do Brasil, segunda pessoa ("você"), direto, sem floreio e sem jargão de marketing.
- Comece respondendo a pergunta da pauta na primeira frase. Nada de introdução de aquecimento.
- Texto útil para quem estuda trabalhando: concreto, com critério de decisão, não com conselho genérico.
- Entre ${MIN_WORDS} e 1400 palavras no corpo.
- Use 4 a 6 seções com h2. Parágrafos curtos. Listas apenas quando a informação é realmente uma lista.
- Inclua de 2 a 4 links internos usando EXATAMENTE os caminhos da lista abaixo, dentro do texto, com âncora descritiva. Nunca use URL com .html e nunca invente caminho que não esteja na lista.

LINKS INTERNOS DISPONÍVEIS
${internalLinks}

FORMATO DA RESPOSTA
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois, sem cerca de código, com exatamente estas chaves:

{
  "title": "título h1, até 65 caracteres, natural, contendo a palavra-chave",
  "metaTitle": "título para o Google, até 52 caracteres",
  "description": "meta description entre 90 e 155 caracteres, que descreve o que o leitor aprende",
  "lead": "primeiro parágrafo, 2 a 4 frases, respondendo a pergunta central de forma autossuficiente",
  "keyFacts": [["rótulo curto", "valor objetivo"], ["...", "..."]],
  "sections": [{"h2": "título da seção", "html": "<p>...</p><ul><li>...</li></ul>"}],
  "faq": [{"q": "pergunta real de quem estuda", "a": "resposta de 2 a 4 frases"}]
}

Regras do JSON: keyFacts com 4 a 6 pares; sections com 4 a 6 itens; faq com 3 a 5 perguntas. Em "html" use apenas as tags p, ul, ol, li, strong, em e a. Nada de h1, h2, h3, script, style, iframe ou img.`;
}

/* ------------------------------------------------------------------ *
 * Parse
 * ------------------------------------------------------------------ */

function parseArticle(raw) {
  let text = String(raw || '').trim();
  // O modelo às vezes devolve dentro de cerca de código apesar da instrução.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('resposta sem objeto JSON');
  return JSON.parse(text.slice(start, end + 1));
}

/* ------------------------------------------------------------------ *
 * Travas factuais
 * ------------------------------------------------------------------ *
 * Cada padrão aqui existe porque é uma afirmação que o modelo não tem como
 * sustentar. A checagem é feita sobre o texto puro da matéria inteira.
 */

const FORBIDDEN = [
  [/\bvagas?\s+(abertas?|dispon[ií]ve(l|is)|ofertadas?)\b/i, 'afirma que há vagas abertas'],
  [/\binscri[çc][õo]es\s+(abertas?|encerram|come[çc]am|v[ãa]o at[ée])/i, 'informa prazo de inscrição'],
  [/\bedital\s+(n[º°.]|n[uú]mero|\d)/i, 'cita número de edital'],
  [/\b(sal[áa]rio|remunera[çc][ãa]o|vencimento|provento)\w*\b[^.<]{0,40}R\$/i, 'informa salário'],
  [/R\$\s?\d[\d.,]*\s*(mil|por m[êe]s|mensa)/i, 'informa valor de remuneração'],
  [/\bnota de corte\s+(foi|é|ficou|de)\s*\d/i, 'informa nota de corte'],
  [/\bprova\s+(ser[áa]|acontece|est[áa] marcada|ocorre)\s+(em|no|na|dia)\b/i, 'informa data de prova'],
  [/\b(\d{1,2}\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro))\b/i, 'cita data específica'],
  [/\bconcurso\s+\w+\s+20[2-9]\d\b/i, 'nomeia certame com ano, como se estivesse em andamento'],
  [/\b\d{1,3}(?:[.,]\d+)?\s?%\s+(d[oae]s|dos candidatos|das provas|de aprova)/i, 'usa estatística não verificável'],
  [/\bsegundo\s+(pesquisa|estudo|levantamento|dados d[eo])/i, 'atribui a fonte não verificável'],
  [/\b(garante|garantia de|assegura)\s+(a\s+)?aprova[çc][ãa]o/i, 'promete aprovação'],
  [/\b(\d+)\s+(candidatos?|aprovados?|alunos?)\s+(j[áa]|foram|passaram|conseguiram)/i, 'cita número de aprovados'],
  [/\bmilhares de (aprovados|alunos)/i, 'cita volume de aprovados']
];

const ALLOWED_TAGS = /^(p|ul|ol|li|strong|em|a)$/;

function factualProblems(text) {
  const problems = [];
  for (const [pattern, label] of FORBIDDEN) {
    const m = text.match(pattern);
    if (!m) continue;
    // Uma menção negada ("não divulgamos vagas abertas", "sem data de prova")
    // é justamente o que queremos que o texto diga. Só a afirmação conta.
    const before = text.slice(Math.max(0, m.index - 90), m.index);
    if (/\bn[ãa]o\b|\bnem\b|\bsem\b|\bnenhum/i.test(before)) continue;
    problems.push(`${label}: "${m[0].trim()}"`);
  }
  return problems;
}

/* ------------------------------------------------------------------ *
 * Validação estrutural + factual
 * ------------------------------------------------------------------ */

function validateArticle(article, context) {
  const { published = [], allowedPaths = [] } = context || {};
  const problems = [];
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  const title = str(article.title);
  const metaTitle = str(article.metaTitle) || title;
  const description = str(article.description);
  const lead = str(article.lead);
  const sections = Array.isArray(article.sections) ? article.sections : [];
  const faq = Array.isArray(article.faq) ? article.faq : [];
  const keyFacts = Array.isArray(article.keyFacts) ? article.keyFacts : [];

  if (!title) problems.push('sem título');
  if (!description) problems.push('sem meta description');
  if (!lead) problems.push('sem parágrafo de abertura');
  if (sections.length < 3) problems.push(`só ${sections.length} seções (mínimo 3)`);
  if (faq.length < 3) problems.push(`só ${faq.length} perguntas no FAQ (mínimo 3)`);
  if (keyFacts.length < 3) problems.push(`só ${keyFacts.length} fatos-chave (mínimo 3)`);

  // O <title> final leva o sufixo da marca; o corte da SERP vale sobre o total.
  if (metaTitle.length + BRAND_SUFFIX.length > MAX_TITLE) {
    problems.push(`metaTitle de ${metaTitle.length} caracteres não cabe com o sufixo da marca`);
  }
  if (description.length < 70 || description.length > 160) {
    problems.push(`meta description de ${description.length} caracteres (ideal 70–160)`);
  }

  const bodyHtml = sections.map((s) => str(s.html)).join('');
  const total = words(lead) + words(bodyHtml) + words(faq.map((f) => str(f.q) + ' ' + str(f.a)).join(' '));
  if (total < MIN_WORDS) problems.push(`matéria com ${total} palavras (mínimo ${MIN_WORDS})`);

  for (const s of sections) {
    if (!str(s.h2)) problems.push('seção sem h2');
    if (!str(s.html)) problems.push(`seção "${str(s.h2)}" sem corpo`);
  }

  // Tag fora da lista branca é injeção de markup, não estilo.
  for (const tag of bodyHtml.matchAll(/<\/?([a-zA-Z0-9]+)[\s>/]/g)) {
    if (!ALLOWED_TAGS.test(tag[1].toLowerCase())) problems.push(`tag não permitida no corpo: <${tag[1]}>`);
  }

  // Links: só caminhos internos que existem de fato, e nunca com .html, que na
  // Vercel custa um 308 por clique por causa do cleanUrls.
  for (const href of bodyHtml.matchAll(/href="([^"]*)"/g)) {
    const target = href[1];
    if (target.endsWith('.html')) problems.push(`link com .html: ${target}`);
    else if (!target.startsWith('/')) problems.push(`link externo não permitido: ${target}`);
    else if (allowedPaths.length && !allowedPaths.includes(target.split('#')[0])) {
      problems.push(`link para caminho inexistente: ${target}`);
    }
  }

  const fullText = [title, description, lead, faq.map((f) => str(f.q) + ' ' + str(f.a)).join(' '),
    keyFacts.map((k) => (Array.isArray(k) ? k.join(' ') : '')).join(' '),
    sections.map((s) => str(s.h2) + ' ' + str(s.html).replace(/<[^>]+>/g, ' ')).join(' ')].join(' ');
  problems.push(...factualProblems(fullText));

  const slug = slugify(title);
  if (!slug) problems.push('título não gera slug válido');
  if (published.some((a) => a.slug === slug)) problems.push(`slug já publicado: ${slug}`);
  if (published.some((a) => a.title === title)) problems.push('título idêntico a uma matéria já publicada');
  if (published.some((a) => a.description === description)) problems.push('meta description idêntica a uma matéria já publicada');

  return { ok: problems.length === 0, problems, slug };
}

/* ------------------------------------------------------------------ *
 * Registro final
 * ------------------------------------------------------------------ */

function toRecord(article, topic, slug, date) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    slug,
    topicId: topic.id,
    scope: topic.scope,
    keyword: topic.keyword,
    title: str(article.title),
    metaTitle: str(article.metaTitle) || str(article.title),
    description: str(article.description),
    lead: str(article.lead),
    keyFacts: (article.keyFacts || []).filter((k) => Array.isArray(k) && k.length === 2),
    sections: (article.sections || []).map((s) => ({ h2: str(s.h2), html: str(s.html) })),
    faq: (article.faq || []).map((f) => ({ q: str(f.q), a: str(f.a) })),
    published: date,
    updated: date
  };
}

module.exports = {
  MIN_WORDS,
  BRAND_SUFFIX,
  slugify,
  pickTopic,
  buildPrompt,
  parseArticle,
  validateArticle,
  factualProblems,
  toRecord
};
