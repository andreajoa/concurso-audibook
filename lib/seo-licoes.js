'use strict';
/**
 * Lições de SEO/GEO aplicadas ao fim de cada apostila (27/11/2026).
 *
 * Vieram da avaliação dos vídeos de SEO com Claude Code do canal Income Stream
 * Surfers. O que vale a pena: pesquisar as páginas do topo do Google antes de
 * escrever, achar buscas de cauda longa com intenção de compra e responder na
 * página as perguntas que os concorrentes respondem. O que derruba site: repetir
 * a palavra-chave em todo título, subtítulo e FAQ, gerar páginas em massa e
 * fabricar backlinks com automação.
 *
 * As regras ficam aqui, como funções puras, para que scripts/verify-seo-licoes.mjs,
 * scripts/seo-acompanhamento.mjs e os testes usem exatamente as mesmas.
 * Passo a passo para quem publica: docs/seo-geo-pos-apostila.md.
 */

const STOP = new Set(('a o as os de da do das dos e em no na nos nas para pra por com sem um uma uns umas ' +
  'ao aos que se seu sua seus suas ou como mais mas the and of for to in on').split(' '));

// Limites calibrados nas 112 páginas do site em 27/11/2026: nenhuma página
// atual passa deles. Eles existem para barrar o próximo exagero, não para
// reescrever o que já está no ar.
const LIMITES = {
  title: 2,          // a mesma palavra mais de 2 vezes no <title>
  h1: 2,
  description: 3,    // na meta description
  porBloco: 2,       // a mesma frase de busca mais de 2 vezes num parágrafo, item ou resposta
  porPagina: (palavras) => Math.max(4, Math.floor(palavras / 250)),
  subtitulosMin: 4   // a regra da metade dos subtítulos só vale a partir de 4 subtítulos
};

// Frases de compra que a casa disputa no Google. São justamente as que mais
// tentam a repetir; a consulta principal de cada apostila entra junto (ficha).
const FRASES_COMPRA = [
  { nome: 'apostila para concurso', re: /\bapostilas? (?:para|pra) (?:o |os )?concursos?\b/g },
  { nome: 'comprar apostila', re: /\bcomprar (?:a |as )?apostilas?\b/g },
  { nome: 'apostila em PDF', re: /\bapostilas?(?: [a-z0-9-]+){0,4} em pdf\b/g }
];

// Origem aceita para uma busca de cauda longa: só o que dá para conferir sem pagar.
const FONTES_CAUDA = ['autocomplete', 'pessoas-tambem-perguntam', 'buscas-relacionadas',
  'keyword-planner', 'google-trends', 'search-console', 'concorrente'];
const PLATAFORMAS_GEO = ['chatgpt', 'perplexity', 'google-ai-mode', 'google-ai-overview', 'gemini', 'copilot', 'claude'];
// A resposta de uma lacuna precisa continuar na página depois de amanhã: o site
// é refeito todo dia e textos como "inscrições abertas" mudam sozinhos.
const STATUS_RELATIVO = /\b(abertas?|encerrad[ao]s?|hoje|amanha|ontem|faltam|ultim[oa]s? dias?)\b/;

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', middot: '·' };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

function semTags(html) {
  return decode(String(html || '')
    .replace(/<(script|style|svg|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '));
}

// Corpo da página sem a moldura do site (cabeçalho, menus e rodapé), que se
// repete em todas as páginas e não diz nada sobre o conteúdo de cada uma.
function semMoldura(html) {
  const m = String(html).match(/<body\b[\s\S]*<\/body>/i);
  return (m ? m[0] : String(html)).replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ');
}

function textoDaPagina(html) {
  return norm(semTags(semMoldura(html)));
}

function palavras(textoNorm) {
  return String(textoNorm).match(/[a-z0-9]+/g) || [];
}

function contar(textoNorm, re) {
  return (String(textoNorm).match(new RegExp(re.source, 'g')) || []).length;
}

function maisRepetida(texto) {
  const vezes = new Map();
  for (const w of palavras(norm(texto))) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    vezes.set(w, (vezes.get(w) || 0) + 1);
  }
  let pior = { palavra: '', vezes: 0 };
  for (const [palavra, n] of vezes) if (n > pior.vezes) pior = { palavra, vezes: n };
  return pior;
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "apostila guarda municipal campinas" também casa com "apostila guarda municipal de campinas".
function fraseRegex(consulta) {
  const termos = palavras(norm(consulta)).filter((w) => !STOP.has(w));
  if (!termos.length) return /(?!)/g;
  const entre = '(?:[ -](?:de|da|do|das|dos|e|para|pra|o|a|em|no|na))*[ -]';
  return new RegExp('\\b' + termos.map(escapar).join(entre) + '\\b', 'g');
}

function primeiro(html, re) {
  const m = String(html).match(re);
  return m ? m[1] : '';
}

/** Problemas de repetição forçada (keyword stuffing) numa página gerada. */
function checarExcesso(html, extras = []) {
  const problemas = [];
  const campos = [
    ['title', decode(primeiro(html, /<title>([\s\S]*?)<\/title>/i)), LIMITES.title],
    ['h1', semTags(primeiro(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)), LIMITES.h1],
    ['meta description', decode(primeiro(html, /<meta name="description" content="([^"]*)"/i)), LIMITES.description]
  ];
  for (const [campo, texto, max] of campos) {
    const r = maisRepetida(texto);
    if (r.vezes > max) problemas.push(`${campo} repete "${r.palavra}" ${r.vezes} vezes (máximo ${max})`);
  }

  const corpo = semMoldura(html);
  const texto = norm(semTags(corpo));
  const total = palavras(texto).length;
  const limite = LIMITES.porPagina(total);
  const blocos = [...corpo.matchAll(/<(p|li|dd|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => norm(semTags(m[2])));
  const subtitulos = [...corpo.matchAll(/<(h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => norm(semTags(m[2]))).filter(Boolean);

  for (const f of [...FRASES_COMPRA, ...extras]) {
    const n = contar(texto, f.re);
    if (n > limite) problemas.push(`"${f.nome}" aparece ${n} vezes em ${total} palavras (máximo ${limite})`);
    const pior = blocos.reduce((max, b) => Math.max(max, contar(b, f.re)), 0);
    if (pior > LIMITES.porBloco) problemas.push(`um mesmo parágrafo repete "${f.nome}" ${pior} vezes (máximo ${LIMITES.porBloco})`);
    const comFrase = subtitulos.filter((s) => contar(s, f.re) > 0).length;
    if (subtitulos.length >= LIMITES.subtitulosMin && comFrase * 2 > subtitulos.length) {
      problemas.push(`${comFrase} de ${subtitulos.length} subtítulos repetem "${f.nome}"`);
    }
  }
  return problemas;
}

const dataIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const lista = (v) => (Array.isArray(v) ? v : []);

/** Problemas de formato na ficha content/seo-pesquisa/<slug>.json. */
function validarFicha(f, slug) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return ['a ficha precisa ser um objeto JSON'];
  const p = [];
  if (f.slug !== slug) p.push(`slug "${f.slug}" difere do nome do arquivo (${slug})`);
  if (!dataIso(f.data)) p.push('data da pesquisa ausente ou fora do formato AAAA-MM-DD');
  if (palavras(norm(f.consultaPrincipal)).filter((w) => !STOP.has(w)).length < 2) {
    p.push('consultaPrincipal ausente: a busca que a página quer ganhar, com pelo menos 2 palavras');
  }

  const concorrentes = lista(f.concorrentes);
  if (concorrentes.length < 3) p.push(`concorrentes: ${concorrentes.length} de no mínimo 3 páginas do topo do Google`);
  concorrentes.forEach((c, i) => {
    const url = c && typeof c.url === 'string' ? c.url : '';
    if (!/^https:\/\/[^\s/]+\.[^\s/]+/.test(url)) p.push(`concorrentes[${i}] sem url https`);
    else if (/concursotrilhaaprova\.online/i.test(url)) p.push(`concorrentes[${i}] aponta para o próprio site`);
    if (!lista(c && c.cobre).length) p.push(`concorrentes[${i}] sem "cobre": o que a página deles responde`);
  });

  const cauda = lista(f.caudaLonga);
  if (cauda.length < 5) p.push(`caudaLonga: ${cauda.length} de no mínimo 5 buscas reais`);
  cauda.forEach((c, i) => {
    if (!c || !norm(c.consulta)) p.push(`caudaLonga[${i}] sem consulta`);
    if (!c || !FONTES_CAUDA.includes(c.fonte)) p.push(`caudaLonga[${i}] com fonte "${c && c.fonte}" (use: ${FONTES_CAUDA.join(', ')})`);
  });

  const lacunas = lista(f.lacunas);
  if (lacunas.length < 3) p.push(`lacunas: ${lacunas.length} de no mínimo 3 perguntas que os concorrentes respondem`);
  lacunas.forEach((l, i) => {
    if (!l || !norm(l.pergunta)) p.push(`lacunas[${i}] sem pergunta`);
    const resposta = l ? norm(semTags(l.resposta)) : '';
    if (resposta.length < 3) p.push(`lacunas[${i}] sem o trecho de resposta que precisa aparecer na página`);
    else if (STATUS_RELATIVO.test(resposta)) p.push(`lacunas[${i}] usa situação que muda com a data ("${l.resposta}"): use um fato estável do edital`);
    if (!l || !norm(l.fonte)) p.push(`lacunas[${i}] sem fonte (item do edital, lei ou página oficial)`);
  });

  if (f.geo !== undefined && !Array.isArray(f.geo)) p.push('geo precisa ser uma lista');
  lista(f.geo).forEach((g, i) => {
    if (!g || !dataIso(g.data)) p.push(`geo[${i}] sem data AAAA-MM-DD`);
    if (!g || !PLATAFORMAS_GEO.includes(g.plataforma)) p.push(`geo[${i}] com plataforma "${g && g.plataforma}" (use: ${PLATAFORMAS_GEO.join(', ')})`);
    if (!g || !norm(g.pergunta)) p.push(`geo[${i}] sem pergunta`);
    if (!g || typeof g.trilhaAparece !== 'boolean') p.push(`geo[${i}] sem trilhaAparece (true ou false)`);
  });
  return p;
}

/** Perguntas da ficha cuja resposta não aparece no texto da página. */
function respostasAusentes(f, textoNorm) {
  return lista(f && f.lacunas)
    .filter((l) => l && norm(semTags(l.resposta)) && !textoNorm.includes(norm(semTags(l.resposta))))
    .map((l) => l.pergunta);
}

/** Palavras da consulta principal que não estão nem no title nem no H1. */
function consultaFora(f, html) {
  const alvo = new Set(palavras(norm(decode(primeiro(html, /<title>([\s\S]*?)<\/title>/i)) + ' ' +
    semTags(primeiro(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)))));
  return palavras(norm(f && f.consultaPrincipal)).filter((w) => !STOP.has(w) && w !== 'comprar' && !alvo.has(w));
}

module.exports = {
  LIMITES, FRASES_COMPRA, FONTES_CAUDA, PLATAFORMAS_GEO,
  norm, decode, semTags, semMoldura, textoDaPagina, palavras, contar, maisRepetida, fraseRegex,
  checarExcesso, validarFicha, respostasAusentes, consultaFora
};
