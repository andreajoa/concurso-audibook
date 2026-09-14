/**
 * Gera as páginas públicas, os metadados, o grafo de dados estruturados,
 * o sitemap, o robots.txt, o feed RSS e os arquivos llms.txt (GEO).
 *
 * Tudo é derivado de products/catalog.json, content/search-guides.json e
 * content/local-seo.json. Nada aqui inventa vagas, datas, notas ou avaliações.
 */
const fs = require('node:fs');

const catalog = require('../products/catalog.json');
const guides = require('../content/search-guides.json');
const cities = require('../content/local-seo.json');
// Matérias escritas pelo cron editorial. O arquivo é atualizado por commit do
// worker (lib/editorial-cron-handler.js), e é este build que as transforma em página.
const articles = require('../content/articles.json');
// Ferramentas gratuitas: a página é estática e indexável, o cálculo roda no
// navegador (public/ferramentas.js). Nenhuma delas depende de backend.
const tools = require('../content/ferramentas.json');
// Portal de concursos: esta parte do site não vende nada. Ela responde "o que
// está aberto perto de mim e até quando dá para se inscrever". As regras e a
// trava de fonte oficial vivem em lib/concursos.js.
const concursosRaw = require('../content/concursos.json');
const cn = require('../lib/concursos.js');

const ORIGIN = 'https://www.concursotrilhaaprova.online';
const CDN = 'https://margareth-5-estrategias.floot.app';
const SUPPORT_EMAIL = 'suporte@concursotrilhaaprova.online';
const AUTHOR_NAME = 'Margareth Almeida';
// Perfil oficial. Entra no rodapé e no sameAs para que Google e IAs liguem
// a marca ao mesmo dono em vez de tratarem site e Instagram como duas coisas.
const INSTAGRAM_URL = 'https://www.instagram.com/trilhaaprova.concursos/';
const BUILD_DATE = process.env.SITE_UPDATED || new Date().toISOString().slice(0, 10);

const products = Object.values(catalog).filter(p => p.active);
const footer = fs.readFileSync('lib/site-footer.html', 'utf8');
const COVER = products[0].storefront.cover3d;

const verification = process.env.GOOGLE_SITE_VERIFICATION || 'WBWn3z5Lp6fkNKGivLwE5zUfi6LWK94BWs6NcQl2puY';
if (!/^[A-Za-z0-9_-]{10,200}$/.test(verification)) throw new Error('Invalid Search Console verification token');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = v => JSON.stringify(v).replace(/</g, '\\u003c');
const plain = html => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const money = cents => (cents / 100).toFixed(2);
const brl = cents => 'R$ ' + money(cents).replace('.', ',');

/* ------------------------------------------------------------------ *
 * Nós reutilizáveis do grafo schema.org
 * ------------------------------------------------------------------ */

const areaServed = [
  { '@type': 'Country', name: 'Brasil' },
  ...cities.map(c => ({ '@type': 'City', name: c.city, addressRegion: c.state, addressCountry: 'BR' }))
];

const organization = {
  '@type': ['Organization', 'EducationalOrganization'],
  '@id': ORIGIN + '/#organization',
  name: 'Trilha Aprova',
  alternateName: 'Trilha Aprova — apostilas para concursos',
  url: ORIGIN + '/',
  email: SUPPORT_EMAIL,
  description: 'Editora digital independente de apostilas em PDF com audiobook para candidatos a concursos públicos no Brasil.',
  logo: { '@type': 'ImageObject', '@id': ORIGIN + '/#logo', url: ORIGIN + '/assets/trilha-aprova-logo.webp', width: 180, height: 84, caption: 'Trilha Aprova' },
  image: { '@id': ORIGIN + '/#logo' },
  founder: { '@id': ORIGIN + '/#author' },
  sameAs: [INSTAGRAM_URL],
  knowsLanguage: 'pt-BR',
  knowsAbout: [
    'Concursos públicos no Brasil',
    'Apostilas para concurso',
    'Audiobooks de estudo',
    'Preparação para concursos na Baixada Santista',
    'Banca IBAM',
    'Redação para concursos de nível fundamental'
  ],
  areaServed,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SUPPORT_EMAIL,
    areaServed: 'BR',
    availableLanguage: ['Portuguese', 'pt-BR']
  }
};

const author = {
  '@type': 'Person',
  '@id': ORIGIN + '/#author',
  name: AUTHOR_NAME,
  url: ORIGIN + '/sobre',
  jobTitle: 'Autora de materiais de preparação para concursos públicos',
  worksFor: { '@id': ORIGIN + '/#organization' },
  knowsLanguage: 'pt-BR',
  knowsAbout: ['Educação', 'Educação Especial', 'Produção textual', 'Preparação para concursos públicos']
};

const website = {
  '@type': 'WebSite',
  '@id': ORIGIN + '/#website',
  name: 'Trilha Aprova',
  url: ORIGIN + '/',
  inLanguage: 'pt-BR',
  publisher: { '@id': ORIGIN + '/#organization' },
  copyrightHolder: { '@id': ORIGIN + '/#organization' }
};

const BASE_NODES = [organization, author, website];

const faqNode = (url, faq) => ({
  '@type': 'FAQPage',
  '@id': url + '#faq',
  mainEntity: faq.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a }
  }))
});

const breadcrumbNode = (url, trail) => ({
  '@type': 'BreadcrumbList',
  '@id': url + '#breadcrumb',
  itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t[0], item: ORIGIN + t[1] }))
});

const webPageNode = (url, { title, description, image, updated, published, hasFaq, hasBreadcrumb }) => {
  const node = {
    '@type': 'WebPage',
    '@id': url + '#webpage',
    url,
    name: title,
    description,
    inLanguage: 'pt-BR',
    isPartOf: { '@id': ORIGIN + '/#website' },
    about: { '@id': ORIGIN + '/#organization' },
    datePublished: published || updated,
    dateModified: updated,
    primaryImageOfPage: { '@type': 'ImageObject', url: image },
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '.answer', '.key-facts'] }
  };
  if (hasBreadcrumb) node.breadcrumb = { '@id': url + '#breadcrumb' };
  if (hasFaq) node.mainEntity = { '@id': url + '#faq' };
  return node;
};

/* ------------------------------------------------------------------ *
 * Registro de URLs para sitemap / llms.txt / feed
 * ------------------------------------------------------------------ */

const urls = [];
const addUrl = (loc, opts = {}) => urls.push({ loc, lastmod: BUILD_DATE, priority: '0.6', images: [], ...opts });
const corpus = [];

/* ------------------------------------------------------------------ *
 * Blocos visuais compartilhados
 * ------------------------------------------------------------------ */

/* A base de concursos é resolvida aqui, antes do menu, porque o menu mostra as
   cidades. Se alguma entrada não tiver fonte oficial ou tiver data inválida, o
   build para: é melhor não publicar do que publicar prazo errado. */
const concursoProblems = concursosRaw.flatMap(cn.problems);
if (concursoProblems.length) {
  throw new Error('content/concursos.json tem entrada sem fonte ou com dado inválido:\n  ' + concursoProblems.join('\n  '));
}

const concursos = concursosRaw.map(c => cn.normalize(c, BUILD_DATE));
const estados = cn.groupByUf(concursos);
const estadoPorUf = new Map(estados.map(e => [e.uf, e]));
const concursosAbertos = concursos.filter(c => c.status === 'inscricoes_abertas');

/* Os destinos do menu principal. A lista é curta de propósito: cada item aqui é
   uma seção inteira do site, não uma página solta. O que ficou de fora
   (glossário, guia de escolha de apostila, Baixada Santista) continua a um
   clique pelo rodapé, que também vai em todas as páginas. */
const NAV = [
  ['/apostilas-para-concurso', 'Apostilas'],
  ['/ferramentas', 'Ferramentas grátis'],
  ['/materias', 'Matérias'],
  ['/como-estudar-para-concurso-do-zero', 'Como estudar'],
  ['/perguntas-frequentes', 'Dúvidas'],
  ['/contato', 'Atendimento']
];

/**
 * Menu de concursos: estado -> cidade.
 *
 * Abre no hover e também no foco do teclado, sem JavaScript. Um painel que
 * depende de script não abre enquanto a página ainda carrega, e quem chega
 * aqui está procurando a cidade dele agora. No celular o painel não aparece e
 * o rótulo funciona como link direto para /concursos, porque passar o mouse
 * não existe em tela de toque.
 */
const megaHtml = (() => {
  if (!estados.length) return '<a href="/concursos">Concursos abertos</a>';

  const colunas = estados.map(e => {
    const cidades = e.municipios.map(m => {
      const abertos = m.concursos.filter(c => c.status === 'inscricoes_abertas').length;
      const nota = abertos
        ? abertos + (abertos === 1 ? ' inscrição aberta' : ' inscrições abertas')
        : m.concursos[0].statusLabel;
      return `<li><a href="${m.path}">${esc(m.municipio)}<span>${esc(nota)}</span></a></li>`;
    }).join('');
    return `<div class="mega-col"><a class="mega-uf" href="/concursos/${e.ufSlug}">${esc(e.ufNome)}</a><ul>${cidades}</ul></div>`;
  }).join('');

  const abertos = concursosAbertos.length;
  return '<div class="mega">' +
    '<a class="mega-trigger" href="/concursos">Concursos abertos</a>' +
    `<div class="mega-panel"><div class="mega-cols">${colunas}</div>` +
    `<p class="mega-foot"><a href="/concursos">Ver todos os estados</a> · ${concursos.length} certames conferidos na página oficial do órgão, ${abertos} com inscrição aberta</p>` +
    '</div></div>';
})();

const navHtml = megaHtml +
  NAV.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('') +
  '<a class="nav-access" href="/recuperar">Já comprei</a>';

/* Um cabeçalho só, para o site inteiro.
   Quem cai em /termos por um link do Google não pode ficar preso ali com uma
   logo apontando para a home como única saída. Este bloco é gerado uma vez e
   depois carimbado em toda página estática — inclusive nas que não passam pelo
   renderPage, como a home, o obrigado e as páginas legais. */
const siteHeader = '<header class="guide-header">' +
  '<a class="guide-brand" href="/" aria-label="Trilha Aprova — início">' +
  '<img src="/assets/trilha-aprova-logo.webp?v=20260912" alt="Trilha Aprova" width="138" height="64"></a>' +
  `<nav aria-label="Navegação do site">${navHtml}</nav></header>`;

/* O estilo do cabeçalho mora num arquivo próprio porque as páginas escritas à
   mão (termos, obrigado, recuperar) não carregam seo.css. Sem esta folha o menu
   aparece, mas como uma pilha de links sem forma. */
const HEADER_CSS_TAG = '<link rel="stylesheet" href="/site-header.css">';

/* Sem um ícone declarado o navegador procura /favicon.ico sozinho, não acha, e a
   aba fica com a folha em branco — o mesmo desenho que o Chrome dá para uma
   página que ninguém cuida. Num site que cobra pelo material isso custa
   confiança. O SVG serve qualquer tamanho e dispensa a coleção de PNGs. */
const FAVICON_TAGS =
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' +
  '<link rel="apple-touch-icon" href="/favicon.svg">';

const productLinks = products
  .map(p => `<li><a href="/apostilas/${p.slug}">${esc(p.shortName)}</a> — PDF, resumo em áudio e ${p.assets.chapters.length} capítulos. ${esc(p.audience)}.</li>`)
  .join('');

const cityLinks = cities
  .map(c => `<li><a href="/${c.slug}">Concursos públicos em ${esc(c.city)}</a></li>`)
  .join('');

const keyFactsHtml = facts => !facts || !facts.length ? '' :
  `<dl class="key-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

const faqHtml = faq => !faq || !faq.length ? '' :
  `<section class="faq-block"><h2>Perguntas frequentes</h2>${faq.map(f => `<div class="faq-item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('')}</section>`;

const crumbsHtml = trail => `<nav class="crumbs" aria-label="Trilha de navegação">${
  trail.map((t, i) => i === trail.length - 1
    ? `<span aria-current="page">${esc(t[0])}</span>`
    : `<a href="${t[1]}">${esc(t[0])}</a><span class="crumb-sep" aria-hidden="true">›</span>`).join('')
}</nav>`;

const disclaimer = '<p class="page-note">Material independente de estudo, sem vínculo com órgãos públicos ou bancas organizadoras. Não divulgamos vagas, datas ou inscrições abertas e não há garantia de aprovação. Confirme sempre as informações no edital oficial.</p>';

/* ------------------------------------------------------------------ *
 * <head> comum
 * ------------------------------------------------------------------ */

function seoBlock({ path, title, description, image, nodes }) {
  const url = ORIGIN + path;
  return '<!-- seo:start -->' +
    `<meta name="google-site-verification" content="${verification}">` +
    `<link rel="canonical" href="${url}">` +
    `<link rel="alternate" hreflang="pt-BR" href="${url}">` +
    `<link rel="alternate" hreflang="x-default" href="${url}">` +
    '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">' +
    '<meta name="googlebot" content="index,follow,max-image-preview:large,max-snippet:-1">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:locale" content="pt_BR">' +
    '<meta property="og:site_name" content="Trilha Aprova">' +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(description)}">` +
    `<meta property="og:url" content="${url}">` +
    `<meta property="og:image" content="${esc(image)}">` +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="1200">' +
    `<meta property="og:image:alt" content="${esc(title)}">` +
    '<meta name="twitter:card" content="summary_large_image">' +
    `<meta name="twitter:title" content="${esc(title)}">` +
    `<meta name="twitter:description" content="${esc(description)}">` +
    `<meta name="twitter:image" content="${esc(image)}">` +
    `<meta name="author" content="${esc(AUTHOR_NAME)}">` +
    '<meta name="geo.region" content="BR-SP">' +
    '<meta name="geo.placename" content="Santos, Baixada Santista, São Paulo, Brasil">' +
    `<link rel="preconnect" href="${CDN}" crossorigin>` +
    `<link rel="dns-prefetch" href="${CDN}">` +
    FAVICON_TAGS +
    '<link rel="manifest" href="/site.webmanifest">' +
    '<link rel="alternate" type="application/rss+xml" title="Trilha Aprova — guias de estudo" href="/feed.xml">' +
    `<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@graph': [...BASE_NODES, ...nodes] })}</script>` +
    '<!-- seo:end -->';
}

/* ------------------------------------------------------------------ *
 * Renderizador de página de conteúdo
 * ------------------------------------------------------------------ */

function renderPage(opts) {
  const {
    path, title, metaTitle, description, kicker = '', lead = '', keyFacts = [],
    body, faq = [], nodes = [], trail = [], image = COVER, updated = BUILD_DATE,
    priority = '0.6', images = [], styles = [], scripts = []
  } = opts;

  const url = ORIGIN + path;
  const fullTrail = [['Início', '/'], ...trail, [title, path]];
  const graph = [
    webPageNode(url, { title: metaTitle || title, description, image, updated, hasFaq: faq.length > 0, hasBreadcrumb: true }),
    breadcrumbNode(url, fullTrail),
    ...(faq.length ? [faqNode(url, faq)] : []),
    ...nodes
  ];

  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#08284f">' +
    `<title>${esc(metaTitle || title)}</title>` +
    `<meta name="description" content="${esc(description)}">` +
    seoBlock({ path, title: metaTitle || title, description, image, nodes: graph }) +
    '<link rel="stylesheet" href="/legal.css"><link rel="stylesheet" href="/site-footer.css">' +
    HEADER_CSS_TAG +
    '<link rel="stylesheet" href="/newsletter.css"><link rel="stylesheet" href="/seo.css">' +
    styles.map(href => `<link rel="stylesheet" href="${esc(href)}">`).join('') +
    `</head><body data-portal-path="${esc(path)}">` +
    siteHeader +
    `<main class="guide">${crumbsHtml(fullTrail)}` +
    (kicker ? `<p class="eyebrow">${esc(kicker)}</p>` : '') +
    `<h1>${esc(title)}</h1>` +
    (lead ? `<p class="answer">${esc(lead)}</p>` : '') +
    keyFactsHtml(keyFacts) +
    body +
    faqHtml(faq) +
    `<p class="updated">Página atualizada em ${esc(updated)}. Autoria: ${esc(AUTHOR_NAME)}.</p>` +
    '</main>' + footer +
    '<script src="/newsletter.js" defer></script><script src="/cookie-consent.js" defer></script><script src="/analytics-crm.js" defer></script>' +
    scripts.map(src => `<script src="${esc(src)}" defer></script>`).join('') +
    '</body></html>';

  const dir = 'public' + path.substring(0, path.lastIndexOf('/'));
  if (dir) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync('public' + path + '.html', html);

  addUrl(path, { lastmod: updated, priority, images });
  corpus.push({ path, title: metaTitle || title, description, updated, text: plain(lead + ' ' + body + ' ' + faq.map(f => f.q + ' ' + f.a).join(' ')) });
}

/* ------------------------------------------------------------------ *
 * Páginas de produto
 * ------------------------------------------------------------------ */

for (const p of products) {
  const path = '/apostilas/' + p.slug;
  const url = ORIGIN + path;
  const price = money(p.priceCents);
  const isAutores = p.slug.startsWith('autores');

  const fit = isAutores
    ? 'Esta apostila revisa autores para Professor Adjunto I e Professor Adjunto II — Educação Especial, com foco na banca IBAM e na edição Santos 2026. Não substitui o estudo de todas as disciplinas do edital.'
    : 'Esta apostila trabalha redação para candidatos de ensino fundamental completo. O gênero textual e os critérios cobrados variam conforme o edital; não é uma apostila específica de todas as disciplinas de um cargo.';

  const productNode = {
    '@type': 'Product',
    '@id': url + '#product',
    name: p.shortName,
    description: p.description,
    image: [p.storefront.cover3d],
    sku: p.slug,
    category: p.category,
    inLanguage: 'pt-BR',
    brand: { '@type': 'Brand', name: 'Trilha Aprova' },
    manufacturer: { '@id': ORIGIN + '/#organization' },
    author: { '@id': ORIGIN + '/#author' },
    audience: { '@type': 'EducationalAudience', educationalRole: 'student', audienceType: p.audience },
    isFamilyFriendly: true,
    offers: {
      '@type': 'Offer',
      '@id': url + '#offer',
      url,
      price,
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      areaServed: { '@type': 'Country', name: 'Brasil' },
      eligibleRegion: { '@type': 'Country', name: 'Brasil' },
      seller: { '@id': ORIGIN + '/#organization' },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'BR',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 7,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/FreeReturn',
        merchantReturnLink: ORIGIN + '/cancelamentos'
      }
    }
  };

  const audiobookNode = {
    '@type': 'Audiobook',
    '@id': url + '#audiobook',
    name: p.name + ' — audiobook',
    description: p.assets.summary.title,
    inLanguage: 'pt-BR',
    author: { '@id': ORIGIN + '/#author' },
    publisher: { '@id': ORIGIN + '/#organization' },
    numberOfPages: undefined,
    hasPart: p.assets.chapters.map((c, i) => ({
      '@type': 'Chapter',
      position: i + 1,
      name: c.title,
      description: c.subtitle
    }))
  };
  delete audiobookNode.numberOfPages;

  const faq = [
    { q: `Quanto custa a ${p.shortName}?`, a: `${brl(p.priceCents)} em pagamento único, sem assinatura. O valor inclui o PDF completo, o resumo em áudio e os ${p.assets.chapters.length} capítulos do audiobook.` },
    { q: 'Como recebo o material depois de pagar?', a: 'A confirmação do pagamento libera automaticamente uma área individual com o PDF e os arquivos de áudio, para leitura, reprodução e download. Não há envio físico.' },
    { q: 'Esta apostila serve para o meu concurso?', a: fit + ' Compare o sumário com o anexo de conteúdo programático do seu edital antes de comprar.' },
    { q: 'Posso pedir reembolso?', a: 'Sim. O Código de Defesa do Consumidor prevê o prazo de 7 dias para o direito de arrependimento em compras pela internet. Basta solicitar pelo canal de atendimento dentro do prazo.' },
    { q: 'Preciso de internet para usar o material?', a: 'Apenas para acessar a área individual e baixar os arquivos. Depois do download, o PDF e os áudios podem ser usados sem conexão.' }
  ];

  const keyFacts = [
    ['Preço', `${brl(p.priceCents)} — pagamento único, sem assinatura`],
    ['Formatos', `PDF + resumo em áudio + ${p.assets.chapters.length} capítulos de audiobook`],
    ['Indicado para', p.audience],
    ['Concurso de referência', `${p.contest} · Banca ${p.examBoard} · ${p.edition}`],
    ['Autoria', AUTHOR_NAME],
    ['Entrega', 'Digital e imediata após a confirmação do pagamento, em todo o Brasil']
  ];

  const body =
    '<div class="product-intro">' +
    `<img src="${esc(p.storefront.cover3d)}" alt="Capa de ${esc(p.shortName)}" width="360" height="450" loading="eager" decoding="async">` +
    `<div><p>${esc(p.description)}</p>` +
    `<p><strong>Para quem:</strong> ${esc(p.audience)}.</p>` +
    `<p>Autoria: ${esc(p.author)}.</p>` +
    `<p class="guide-price">${brl(p.priceCents)}</p>` +
    '<p>Pagamento único. Material digital em português, disponível online em todo o Brasil.</p>' +
    `<a class="guide-button" href="/comprar?produto=${p.slug}">Comprar PDF + audiobook</a></div></div>` +
    `<h2>O que está incluído</h2><ul>${p.proofPoints.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` +
    '<h2>Resumo em áudio e capítulos</h2>' +
    `<p>${esc(p.assets.summary.title)}. O resumo é uma revisão complementar; os capítulos organizam o estudo por assunto.</p>` +
    `<ol class="chapter-list">${p.assets.chapters.map(c => `<li><strong>${esc(c.title)}</strong><p>${esc(c.subtitle)}</p></li>`).join('')}</ol>` +
    `<h2>Este material serve para o meu concurso?</h2><p>${esc(fit)} Confira o conteúdo programático e as retificações no site oficial antes de comprar.</p>` +
    '<h2>Como recebo os arquivos?</h2>' +
    '<p>Após a confirmação do pagamento, sua área individual libera o PDF e os áudios desta apostila para leitura, reprodução e download. <a href="/entrega-e-acesso">Veja como funciona o acesso</a>.</p>' +
    (isAutores
      ? '<h2>Quem estuda na Baixada Santista</h2><p>Esta apostila nasceu do edital de Santos, mas o conteúdo de autores é o mesmo cobrado em muitos concursos municipais de educação. Veja os guias por cidade:</p><ul class="city-links">' + cityLinks + '</ul>'
      : '<h2>Onde a redação costuma ser cobrada</h2><p>Cargos de nível fundamental completo frequentemente incluem prova de produção textual. Veja os guias por cidade da Baixada Santista:</p><ul class="city-links">' + cityLinks + '</ul>') +
    '<h2>Continue sua preparação</h2>' +
    `<ul>${productLinks}</ul>` +
    '<p><a href="/apostila-para-concurso-como-escolher">Como escolher a apostila certa para o seu edital</a> · <a href="/como-estudar-com-apostila-e-audiobook">Como combinar PDF e audiobook</a></p>' +
    disclaimer;

  renderPage({
    path,
    title: p.shortName + ' com audiobook',
    metaTitle: p.shortName + ' com audiobook | Trilha Aprova',
    // A descrição do catálogo é a de venda e pode ser longa; a da SERP tem de caber.
    description: p.seoDescription || p.description,
    kicker: `${p.edition} · ${p.category}`,
    lead: `${p.name} é um material digital de ${brl(p.priceCents)}, em pagamento único, que reúne PDF, resumo em áudio e ${p.assets.chapters.length} capítulos de audiobook. Foi escrito por ${AUTHOR_NAME} para ${p.audience.toLowerCase()}, tendo como referência ${p.contest} e a banca ${p.examBoard}.`,
    keyFacts,
    body,
    faq,
    nodes: [productNode, audiobookNode],
    trail: [['Apostilas', '/apostilas-para-concurso']],
    image: p.storefront.cover3d,
    priority: '0.9',
    images: [p.storefront.cover3d]
  });
}

/* ------------------------------------------------------------------ *
 * Hub do catálogo
 * ------------------------------------------------------------------ */

renderPage({
  path: '/apostilas-para-concurso',
  title: 'Apostilas para concurso com audiobook',
  metaTitle: 'Apostilas para concurso público com audiobook | Trilha Aprova',
  description: 'Apostilas digitais para concursos públicos, em PDF com audiobook. Pagamento único de R$ 24,99 por apostila e acesso imediato em todo o Brasil.',
  kicker: 'CATÁLOGO',
  lead: `A Trilha Aprova publica apostilas digitais para concursos públicos no Brasil. Cada material reúne PDF para leitura, resumo em áudio e audiobook em capítulos, por ${brl(products[0].priceCents)} em pagamento único, sem assinatura. A entrega é digital e imediata após a confirmação do pagamento.`,
  keyFacts: [
    ['Apostilas disponíveis', String(products.length)],
    ['Preço por apostila', `${brl(products[0].priceCents)} — pagamento único`],
    ['Formatos incluídos', 'PDF, resumo em áudio e audiobook em 8 capítulos'],
    ['Entrega', 'Digital e imediata, válida em todo o Brasil'],
    ['Autoria', AUTHOR_NAME]
  ],
  body:
    '<h2>Materiais disponíveis</h2>' +
    '<div class="product-grid">' +
    products.map(p => `<article class="product-card"><img src="${esc(p.storefront.cover3d)}" alt="Capa de ${esc(p.shortName)}" width="240" height="300" loading="lazy" decoding="async"><div><h3><a href="/apostilas/${p.slug}">${esc(p.shortName)}</a></h3><p>${esc(p.description)}</p><p><strong>${brl(p.priceCents)}</strong> · ${esc(p.audience)}</p></div></article>`).join('') +
    '</div>' +
    '<h2>O que vem em cada apostila</h2><ul><li>PDF completo para ler online ou baixar.</li><li>Resumo em áudio para revisão rápida.</li><li>Audiobook dividido em capítulos por assunto.</li><li>Questões com gabarito comentado.</li><li>Acesso individual recuperável pelo e-mail da compra.</li></ul>' +
    '<h2>Como escolher entre elas</h2><p>A escolha depende do cargo do seu edital, não do preço. Se o cargo é de professor com conteúdo pedagógico, comece pela apostila de autores. Se o cargo é de nível fundamental com prova de redação, comece pela apostila de redação. Em caso de dúvida, leia o guia sobre <a href="/apostila-para-concurso-como-escolher">como escolher a apostila certa</a>.</p>' +
    '<h2>Preparação por região</h2><ul class="city-links">' + cityLinks + '</ul>' +
    disclaimer,
  faq: [
    { q: 'Quantas apostilas a Trilha Aprova tem hoje?', a: `Atualmente ${products.length}: ${products.map(p => p.shortName).join(' e ')}. Novos materiais entram no mesmo catálogo, com concurso, banca e oferta próprios.` },
    { q: 'As apostilas são vendidas por assinatura?', a: `Não. Cada apostila é uma compra única de ${brl(products[0].priceCents)}, sem mensalidade e sem renovação automática.` },
    { q: 'Recebo em quanto tempo?', a: 'Imediatamente. Assim que o pagamento é confirmado, a área individual com o PDF e os áudios é liberada automaticamente.' },
    { q: 'Vocês entregam em todo o Brasil?', a: 'Sim. Como a entrega é totalmente digital, o material fica disponível para qualquer cidade do país, sem frete e sem prazo de envio.' }
  ],
  nodes: [{
    '@type': 'ItemList',
    '@id': ORIGIN + '/apostilas-para-concurso#list',
    name: 'Apostilas para concurso com audiobook',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: ORIGIN + '/apostilas/' + p.slug,
      name: p.shortName
    }))
  }],
  priority: '0.9',
  images: products.map(p => p.storefront.cover3d)
});

/* ------------------------------------------------------------------ *
 * Guias de estudo
 * ------------------------------------------------------------------ */

for (const g of guides) {
  const path = '/' + g.slug;
  const url = ORIGIN + path;
  const nodes = [{
    '@type': 'Article',
    '@id': url + '#article',
    headline: g.title,
    description: g.description,
    inLanguage: 'pt-BR',
    author: { '@id': ORIGIN + '/#author' },
    publisher: { '@id': ORIGIN + '/#organization' },
    datePublished: g.updated || BUILD_DATE,
    dateModified: g.updated || BUILD_DATE,
    mainEntityOfPage: { '@id': url + '#webpage' },
    image: [COVER],
    articleSection: 'Guia de estudo'
  }];

  if (g.howTo) {
    nodes.push({
      '@type': 'HowTo',
      '@id': url + '#howto',
      name: g.howTo.name,
      description: g.description,
      inLanguage: 'pt-BR',
      ...(g.howTo.totalTime ? { totalTime: g.howTo.totalTime } : {}),
      step: g.howTo.steps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.name,
        text: s.text,
        url: url + '#passo-' + (i + 1)
      }))
    });
  }

  if (g.glossary) {
    nodes.push({
      '@type': 'DefinedTermSet',
      '@id': url + '#glossary',
      name: g.title,
      inLanguage: 'pt-BR',
      hasDefinedTerm: g.glossary.map(t => ({
        '@type': 'DefinedTerm',
        name: t.term,
        description: t.definition,
        inDefinedTermSet: { '@id': url + '#glossary' }
      }))
    });
  }

  let body = '';
  if (g.howTo) {
    body += `<section class="howto"><h2>${esc(g.howTo.name)}</h2><ol class="howto-steps">` +
      g.howTo.steps.map((s, i) => `<li id="passo-${i + 1}"><strong>${esc(s.name)}</strong><p>${esc(s.text)}</p></li>`).join('') +
      '</ol></section>';
  }
  body += g.body;
  if (g.glossary) {
    body += '<h2>Termos do edital de A a Z</h2><dl class="glossary">' +
      g.glossary.map(t => `<div id="termo-${t.term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}"><dt>${esc(t.term)}</dt><dd>${esc(t.definition)}</dd></div>`).join('') +
      '</dl>';
  }
  body += '<h2>Apostilas disponíveis com audiobook</h2><ul>' + productLinks + '</ul>' + disclaimer;

  renderPage({
    path,
    title: g.title,
    // O h1 pode ser longo e descritivo; o <title> precisa caber na SERP (~60 caracteres).
    metaTitle: (g.metaTitle || g.title) + ' | Trilha Aprova',
    description: g.description,
    kicker: 'GUIA DE ESTUDO',
    lead: g.lead || g.description,
    keyFacts: g.keyFacts,
    body,
    faq: g.faq || [],
    nodes,
    trail: [['Guias de estudo', '/perguntas-frequentes']],
    updated: g.updated || BUILD_DATE,
    priority: '0.8'
  });
}

/* ------------------------------------------------------------------ *
 * Matérias publicadas pelo cron editorial
 * ------------------------------------------------------------------ *
 * Estas páginas nascem de content/articles.json, que é escrito por uma IA e
 * commitado pelo worker. Nada aqui "confia" no conteúdo: o que garante que uma
 * matéria inventada não vá ao ar é a validação em lib/editorial.js, que roda
 * antes do commit, e as travas de scripts/verify-seo.mjs, que rodam depois — o
 * build quebra se uma matéria publicada violar as regras.
 */

// Ordem de exibição: mais recente primeiro, como se espera de uma seção de
// conteúdo. A ordem do arquivo é cronológica de publicação.
const articlesNewestFirst = [...articles].sort((a, b) => String(b.published).localeCompare(String(a.published)));

const articleCard = a =>
  `<li><a href="/materias/${a.slug}">${esc(a.title)}</a><p>${esc(a.description)}</p>` +
  `<p class="article-meta">${esc(a.published)}${a.scope && a.scope !== 'nacional' ? ' · Baixada Santista' : ''}</p></li>`;

for (const a of articlesNewestFirst) {
  const path = '/materias/' + a.slug;
  const url = ORIGIN + path;
  const related = articlesNewestFirst.filter(o => o.slug !== a.slug).slice(0, 4);

  const body =
    a.sections.map(s => `<h2>${esc(s.h2)}</h2>${s.html}`).join('') +
    (related.length
      ? '<h2>Outras matérias</h2><ul class="article-list">' + related.map(articleCard).join('') + '</ul>'
      : '') +
    '<h2>Apostilas com PDF e audiobook</h2><ul>' + productLinks + '</ul>' +
    disclaimer;

  renderPage({
    path,
    title: a.title,
    metaTitle: (a.metaTitle || a.title) + ' | Trilha Aprova',
    description: a.description,
    kicker: a.scope === 'nacional' ? 'MATÉRIA' : 'MATÉRIA · BAIXADA SANTISTA',
    lead: a.lead,
    keyFacts: a.keyFacts,
    body,
    faq: a.faq || [],
    nodes: [{
      '@type': 'Article',
      '@id': url + '#article',
      headline: a.title,
      description: a.description,
      inLanguage: 'pt-BR',
      author: { '@id': ORIGIN + '/#author' },
      publisher: { '@id': ORIGIN + '/#organization' },
      datePublished: a.published,
      dateModified: a.updated || a.published,
      mainEntityOfPage: { '@id': url + '#webpage' },
      image: [COVER],
      articleSection: 'Preparação para concursos',
      keywords: a.keyword,
      isAccessibleForFree: true
    }],
    trail: [['Matérias', '/materias']],
    updated: a.updated || a.published,
    priority: '0.7'
  });
}

/* Hub das matérias — existe mesmo com a lista vazia, porque a rota é linkada
 * na navegação e um 404 no menu é pior que uma seção ainda sem publicações. */
renderPage({
  path: '/materias',
  title: 'Matérias sobre preparação para concursos públicos',
  metaTitle: 'Matérias sobre concursos públicos | Trilha Aprova',
  description: 'Matérias sobre como estudar para concurso público: leitura de edital, cronograma, revisão, questões, redação e preparação na Baixada Santista.',
  kicker: 'CONTEÚDO',
  lead: 'Esta seção reúne matérias sobre método de estudo para concursos públicos: como ler o edital, montar cronograma, revisar, resolver questões e organizar a rotina de quem estuda trabalhando. São textos de preparação — não publicamos vagas, datas nem inscrições, porque essas informações só têm validade no edital oficial do órgão.',
  keyFacts: [
    ['Matérias publicadas', String(articles.length)],
    ['Frequência', 'Publicação semanal'],
    ['Foco', 'Método de estudo e preparação, no Brasil e na Baixada Santista'],
    ['O que não publicamos', 'Vagas, datas de prova, inscrições e salários'],
    ['Autoria editorial', AUTHOR_NAME]
  ],
  body:
    (articlesNewestFirst.length
      ? '<h2>Publicações recentes</h2><ul class="article-list">' + articlesNewestFirst.map(articleCard).join('') + '</ul>'
      : '<h2>Em breve</h2><p>As primeiras matérias desta seção estão sendo publicadas. Enquanto isso, os guias de estudo abaixo cobrem os assuntos principais.</p>') +
    '<h2>Guias de estudo completos</h2><ul>' +
    guides.map(g => `<li><a href="/${g.slug}">${esc(g.title)}</a> — ${esc(g.description)}</li>`).join('') +
    '</ul>' +
    '<h2>Preparação por cidade</h2><ul class="city-links">' + cityLinks + '</ul>' +
    '<h2>Apostilas com PDF e audiobook</h2><ul>' + productLinks + '</ul>' +
    disclaimer,
  faq: [
    { q: 'Com que frequência saem matérias novas?', a: 'A seção é atualizada semanalmente. Cada matéria trata de um assunto de preparação — leitura de edital, cronograma, revisão, questões, redação ou rotina de estudo.' },
    { q: 'Vocês publicam concursos abertos nas matérias?', a: 'Não. Não divulgamos vagas, datas de prova, prazos de inscrição nem salários, porque essas informações mudam e só têm validade no edital oficial do órgão. As matérias tratam de método e preparação.' },
    { q: 'As matérias são gratuitas?', a: 'Sim. Todo o conteúdo desta seção é aberto, sem cadastro e sem pagamento. As apostilas em PDF com audiobook são vendidas à parte.' },
    { q: 'Posso acompanhar as publicações?', a: 'Sim, pelo feed RSS do site em /feed.xml, que reúne as matérias e os guias de estudo assim que são publicados.' }
  ],
  nodes: [{
    '@type': 'Blog',
    '@id': ORIGIN + '/materias#blog',
    name: 'Matérias sobre preparação para concursos públicos',
    inLanguage: 'pt-BR',
    publisher: { '@id': ORIGIN + '/#organization' },
    blogPost: articlesNewestFirst.map(a => ({
      '@type': 'BlogPosting',
      '@id': ORIGIN + '/materias/' + a.slug + '#article',
      headline: a.title,
      url: ORIGIN + '/materias/' + a.slug,
      datePublished: a.published
    }))
  }],
  trail: [],
  priority: '0.8'
});

/* ------------------------------------------------------------------ *
 * Ferramentas gratuitas
 *
 * Rodam inteiras no navegador, com o estado em localStorage. É o único
 * conteúdo do site que uma IA não consegue reproduzir em texto, e é o que
 * costuma receber link espontâneo — ninguém linka apostila, mas linka
 * ferramenta. Por isso cada uma tem página própria, indexável e explicada.
 * ------------------------------------------------------------------ */

const toolNode = t => ({
  '@type': ['SoftwareApplication', 'WebApplication'],
  '@id': ORIGIN + '/ferramentas/' + t.slug + '#app',
  name: t.title,
  description: t.description,
  url: ORIGIN + '/ferramentas/' + t.slug,
  applicationCategory: 'EducationalApplication',
  applicationSubCategory: 'Ferramenta de estudo para concurso público',
  operatingSystem: 'Qualquer navegador moderno',
  browserRequirements: 'Requer JavaScript. Não requer cadastro.',
  inLanguage: 'pt-BR',
  isAccessibleForFree: true,
  permissions: 'Nenhuma. Os dados ficam no armazenamento local do navegador.',
  author: { '@id': ORIGIN + '/#author' },
  publisher: { '@id': ORIGIN + '/#organization' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL', availability: 'https://schema.org/InStock' }
});

for (const t of tools) {
  const path = '/ferramentas/' + t.slug;
  const others = tools.filter(o => o.slug !== t.slug);

  renderPage({
    path,
    title: t.title,
    metaTitle: (t.metaTitle || t.title) + ' | Trilha Aprova',
    description: t.description,
    kicker: 'FERRAMENTA GRATUITA',
    lead: t.lead,
    keyFacts: t.keyFacts,
    body:
      t.appHtml +
      t.sections.map(s => `<h2>${esc(s.h2)}</h2>${s.html}`).join('') +
      '<h2>As outras ferramentas gratuitas</h2><ul>' +
      others.map(o => `<li><a href="/ferramentas/${o.slug}">${esc(o.title)}</a> — ${esc(o.description)}</li>`).join('') +
      '</ul>' +
      '<h2>Apostilas com PDF e audiobook</h2><ul>' + productLinks + '</ul>' +
      disclaimer,
    faq: t.faq,
    nodes: [toolNode(t), {
      '@type': 'HowTo',
      '@id': ORIGIN + path + '#howto',
      name: 'Como usar: ' + t.title,
      inLanguage: 'pt-BR',
      totalTime: 'PT10M',
      estimatedCost: { '@type': 'MonetaryAmount', currency: 'BRL', value: '0' },
      step: [
        { '@type': 'HowToStep', position: 1, name: 'Abra a ferramenta', text: 'A página carrega pronta para uso, sem cadastro e sem informar e-mail.' },
        { '@type': 'HowToStep', position: 2, name: 'Informe os dados do seu edital', text: 'Use o documento oficial do órgão ou da banca como fonte dos números.' },
        { '@type': 'HowToStep', position: 3, name: 'Gere o resultado', text: 'O cálculo acontece no seu navegador e o resultado aparece na mesma página.' },
        { '@type': 'HowToStep', position: 4, name: 'Salve ou imprima', text: 'O progresso fica guardado neste navegador e o botão de imprimir permite salvar em PDF.' }
      ]
    }],
    trail: [['Ferramentas', '/ferramentas']],
    styles: ['/ferramentas.css'],
    scripts: ['/ferramentas.js'],
    priority: '0.8'
  });
}

renderPage({
  path: '/ferramentas',
  title: 'Ferramentas gratuitas para quem estuda para concurso',
  metaTitle: 'Ferramentas gratuitas para concurso público',
  description: 'Trilha do dia, caderno de erros, checklist do edital, cronograma por peso e calculadora de acertos. Rodam no navegador, sem cadastro.',
  kicker: 'GRATUITO',
  lead: 'Quem estuda para concurso raramente sofre por falta de material: sofre por não saber o que abrir hoje. Estas ferramentas respondem as perguntas práticas da rotina — o que estudar agora, o que o edital cobra, quanto tempo dar para cada matéria e quantas questões faltam para a sua meta. Funcionam inteiras dentro do navegador: não pedimos cadastro, não pedimos e-mail e nada do que você digitar sai do seu aparelho.',
  keyFacts: [
    ['Quantas ferramentas', String(tools.length)],
    ['Preço', 'Gratuitas, sem cadastro e sem e-mail'],
    ['Onde os dados ficam', 'No armazenamento local do seu navegador'],
    ['Funcionam no celular', 'Sim, e continuam funcionando offline depois do primeiro acesso'],
    ['O que elas não fazem', 'Não publicam vaga, data de prova nem nota de corte']
  ],
  body:
    '<h2>As ferramentas</h2><div class="tool-cards">' +
    tools.map(t => '<article class="tool-card"><span class="tool-card-tag">Grátis</span>' +
      `<h3><a href="/ferramentas/${t.slug}">${esc(t.title)}</a></h3>` +
      `<p>${esc(t.description)}</p>` +
      `<p><a href="/ferramentas/${t.slug}">Abrir ferramenta</a></p></article>`).join('') +
    '</div>' +
    '<h2>Por que elas não pedem cadastro</h2>' +
    '<p>A troca mais comum na internet é ferramenta grátis em troca do seu e-mail. Aqui não existe essa troca, por um motivo prático: o cálculo é simples o bastante para acontecer no seu próprio navegador, e mandar seus dados para um servidor só criaria um risco que não precisa existir. O que você digitar fica no seu aparelho.</p>' +
    '<p>A consequência é que o resultado não te acompanha entre aparelhos. Se você montar o cronograma no computador, ele não aparece no celular. O botão de imprimir resolve isso: ele abre a caixa de impressão do navegador, onde dá para salvar em PDF e guardar onde você quiser.</p>' +
    '<h2>Como elas se encaixam</h2>' +
    '<ol><li><strong>Comece pelo <a href="/ferramentas/edital-verticalizado">checklist do edital</a>.</strong> Ele transforma o conteúdo programático em lista marcável e responde o que estudar.</li>' +
    '<li><strong>Depois use o <a href="/ferramentas/cronograma-de-estudos">cronograma</a>.</strong> Ele distribui suas horas na proporção de questões e peso, e responde quanto tempo dar para cada matéria.</li>' +
    '<li><strong>No dia a dia, abra a <a href="/ferramentas/trilha-do-dia">trilha do dia</a>.</strong> Ela pega o tempo que você tem hoje e devolve blocos com hora marcada, começando pela matéria que mais pesa e que você menos domina.</li>' +
    '<li><strong>Depois de resolver questões, registre o que errou no <a href="/ferramentas/caderno-de-erros">caderno de erros</a>.</strong> Ele devolve a questão antes de você esquecer e, com alguns registros, mostra se o seu problema é conteúdo ou leitura de enunciado.</li>' +
    '<li><strong>Antes da prova, a <a href="/ferramentas/calculadora-de-acertos">calculadora de acertos</a>.</strong> Ela mostra quantas questões faltam para a sua meta e onde cada acerto rende mais pontos.</li></ol>' +
    '<p>Os resultados ficam salvos no mesmo navegador, então dá para voltar amanhã e continuar de onde parou.</p>' +
    '<h2>O que nós não calculamos</h2>' +
    '<p>Nenhuma das ferramentas informa nota de corte, data de prova, número de vagas ou chance de aprovação. Nota de corte é resultado de uma edição específica, com concorrência específica, e publicar um número desses sem o documento oficial seria inventar informação que alguém usaria para decidir o que estudar. Quando a calculadora pede uma pontuação-alvo, é você quem informa — do edital, do resultado oficial da edição anterior ou da sua própria meta.</p>' +
    '<h2>Conteúdo para acompanhar as ferramentas</h2><ul>' +
    guides.map(g => `<li><a href="/${g.slug}">${esc(g.title)}</a> — ${esc(g.description)}</li>`).join('') +
    '</ul>' +
    '<h2>Apostilas com PDF e audiobook</h2><ul>' + productLinks + '</ul>' +
    disclaimer,
  faq: [
    { q: 'As ferramentas são realmente gratuitas?', a: 'São. Não há cadastro, não pedimos e-mail e não há versão paga delas. As apostilas em PDF com audiobook são vendidas à parte e não são necessárias para usar nenhuma das ferramentas.' },
    { q: 'Meus dados são enviados para vocês?', a: 'Não. O cálculo acontece dentro do seu navegador e o resultado fica no armazenamento local do aparelho. Nada do que você digitar chega até nós.' },
    { q: 'Funciona no celular?', a: 'Sim. Todas foram feitas para tela pequena e continuam funcionando offline depois do primeiro acesso, porque não dependem de servidor para calcular.' },
    { q: 'Vocês informam a nota de corte do meu concurso?', a: 'Não. Nota de corte é resultado de uma edição específica e só o documento oficial do órgão ou da banca vale. A calculadora usa a pontuação que você informar.' },
    { q: 'Preciso instalar alguma coisa?', a: 'Não. Basta abrir a página no navegador. Não há aplicativo, extensão nem download obrigatório.' }
  ],
  nodes: [{
    '@type': 'ItemList',
    '@id': ORIGIN + '/ferramentas#lista',
    name: 'Ferramentas gratuitas para concurso público',
    numberOfItems: tools.length,
    itemListElement: tools.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: ORIGIN + '/ferramentas/' + t.slug,
      name: t.title
    }))
  }, ...tools.map(toolNode)],
  trail: [],
  styles: ['/ferramentas.css'],
  priority: '0.9'
});

/* ------------------------------------------------------------------ *
 * Portal de concursos: estado → município → certame
 *
 * Nada aqui é promocional. Quem chega nesta parte do site ainda não decidiu
 * comprar: quer saber se existe concurso aberto na cidade dele e até quando
 * dá para se inscrever. A apostila só é citada quando existe material para
 * um dos cargos daquele edital.
 * ------------------------------------------------------------------ */

/** Faixa de UFs, como um índice: o que tem concurso vira link, o resto fica opaco. */
function ufStrip(activeUf) {
  const botoes = Object.keys(cn.UF_NOMES).sort().map(uf => {
    const estado = estadoPorUf.get(uf);
    const nome = cn.UF_NOMES[uf];
    if (!estado) return `<span class="uf-chip is-empty" title="Sem concurso mapeado em ${esc(nome)} no momento">${uf}</span>`;
    const marca = uf === activeUf ? ' is-active' : '';
    const abertos = estado.abertos ? `${estado.abertos} com inscrição aberta` : 'acompanhamento';
    return `<a class="uf-chip${marca}" href="/concursos/${uf.toLowerCase()}" title="${esc(nome)} — ${esc(abertos)}">${uf}</a>`;
  }).join('');
  return `<nav class="uf-strip" aria-label="Concursos por estado"><span class="uf-strip-label">Região</span><div class="uf-chips">${botoes}</div></nav>`;
}

/** O aviso de prazo. Vem com data-prazo para o navegador recontar no dia do acesso. */
function prazoHtml(c) {
  if (!c.deadline) return '';
  return `<p class="prazo prazo-${c.deadline.tone}" data-prazo="${esc(c.inscricaoFim)}">${esc(c.deadline.text)}</p>`;
}

/**
 * Aviso de urgência — mas só quando a urgência é real.
 *
 * Quem cria a pressa é a data do edital, não o site. Por isso este bloco
 * desaparece sozinho se não houver inscrição aberta, se a data mais próxima
 * ainda estiver a mais de duas semanas ou se o prazo já tiver passado. Não há
 * contador regressivo piscando nem "últimas vagas": é a mesma frase que a
 * ficha usa, com o link para conferir na fonte.
 */
function alertaPrazo(lista) {
  const abertos = lista.filter(c => c.status === 'inscricoes_abertas' && c.inscricaoFim);
  if (!abertos.length) return '';

  const proxima = abertos.map(c => c.inscricaoFim).sort()[0];
  const dias = cn.daysBetween(BUILD_DATE, proxima);
  if (dias === null || dias < 0 || dias > 14) return '';

  const naData = abertos.filter(c => c.inscricaoFim === proxima);
  const aviso = cn.deadlineNotice({ inscricaoFim: proxima }, BUILD_DATE);
  const cidades = [...new Set(naData.map(c => c.municipio))];
  const destino = cidades.length === 1 ? naData[0].path : '/concursos';
  const quantos = naData.length === 1
    ? 'Um certame encerra'
    : `${naData.length} certames encerram`;
  const onde = cidades.length === 1
    ? ` em ${esc(cidades[0])}`
    : ` em ${cidades.length} cidades`;

  return '<aside class="alerta-prazo">' +
    `<span class="prazo prazo-${aviso.tone}" data-prazo="${esc(proxima)}">${esc(aviso.text)}</span>` +
    `<p>${quantos} a inscrição nesta data${onde}. <a href="${destino}">Conferir ${naData.length === 1 ? 'a ficha' : 'as fichas'}</a> antes de programar o estudo.</p>` +
    '</aside>';
}

/**
 * Convite para ser avisado quando abrir edital naquele lugar.
 *
 * É a única coisa do portal que pede algo em troca, e o que ela pede é o
 * mínimo: um e-mail, com a promessa escrita do que vai chegar. A origem viaja
 * junto para que o aviso seja da cidade certa — mandar edital de Guarulhos
 * para quem pediu Santos é como não mandar nada.
 */
function avisoEdital(lugar, fonte) {
  return '<aside class="aviso-edital">' +
    `<h2>Quer saber quando abrir concurso em ${esc(lugar)}?</h2>` +
    `<p>Avisamos por e-mail quando um edital novo entrar nesta página e quando um prazo que já está no ar mudar. Sem custo, e dá para cancelar em um clique. O aviso não substitui o site oficial do órgão: ele serve para você não perder a data.</p>` +
    `<button type="button" class="aviso-edital-cta" data-newsletter-open data-newsletter-cidade="${esc(lugar)}" data-newsletter-fonte="${esc(fonte)}">Avise-me sobre ${esc(lugar)}</button>` +
    '</aside>';
}

/** Ficha do certame. Cada linha só existe se o dado existir na fonte. */
function concursoCard(c, { heading = 'h3' } = {}) {
  const linhas = [
    ['Órgão', c.orgao],
    ['Banca', c.banca],
    ['Edital', c.edital],
    ['Inscrições', c.inscricaoInicio && c.inscricaoFim ? `${cn.brDate(c.inscricaoInicio)} a ${cn.brDate(c.inscricaoFim)}` : c.inscricaoFim ? `até ${cn.brDate(c.inscricaoFim)}` : null],
    ['Data da prova', c.dataProva ? cn.brDate(c.dataProva) + (c.dataProvaConfirmada ? '' : ' (prevista, aguarda convocação)') : null],
    ['Vagas', typeof c.vagas === 'number' ? String(c.vagas) : null],
    ['Remuneração', typeof c.salarioMin === 'number' ? (typeof c.salarioMax === 'number' && c.salarioMax !== c.salarioMin ? `${brl(Math.round(c.salarioMin * 100))} a ${brl(Math.round(c.salarioMax * 100))}` : brl(Math.round(c.salarioMin * 100))) : null],
    ['Taxa de inscrição', typeof c.taxaInscricao === 'number' ? brl(Math.round(c.taxaInscricao * 100)) : null],
    ['Escolaridade', c.escolaridade?.length ? c.escolaridade.join(', ') : null]
  ].filter(([, v]) => v);

  const materiais = (c.produtos || [])
    .map(slug => products.find(p => p.slug === slug))
    .filter(Boolean);

  return '<article class="concurso-card">' +
    `<span class="concurso-status concurso-${c.statusTone}">${esc(c.statusLabel)}</span>` +
    `<${heading}>${esc(c.orgao)}${c.edital ? ' — ' + esc(c.edital) : ''}</${heading}>` +
    `<p class="concurso-resumo">${esc(c.resumo)}</p>` +
    prazoHtml(c) +
    keyFactsHtml(linhas) +
    (c.cargos?.length ? `<p class="concurso-cargos"><strong>Cargos citados:</strong> ${esc(c.cargos.join(' · '))}</p>` : '') +
    '<p class="concurso-fontes">' +
    `<a href="${esc(c.sourceUrl)}" rel="external nofollow noopener" target="_blank">Página oficial do órgão</a>` +
    (c.editalUrl ? ` · <a href="${esc(c.editalUrl)}" rel="external nofollow noopener" target="_blank">Edital em PDF</a>` : '') +
    ` · <span class="concurso-captura">conferido em ${esc(cn.brDate(c.capturedAt))}</span></p>` +
    (materiais.length
      ? '<div class="concurso-material"><p><strong>Material de estudo para cargos deste edital</strong></p><ul>' +
        materiais.map(p => `<li><a href="/apostilas/${p.slug}">${esc(p.shortName)}</a> — ${esc(p.audience)}</li>`).join('') +
        '</ul></div>'
      : '') +
    '</article>';
}

const concursoFaq = [
  { q: 'De onde vêm estas informações?', a: 'De páginas oficiais dos órgãos e das bancas organizadoras. Cada certame traz o link da fonte e a data em que a informação foi conferida. Nada é copiado de portal de notícias sem confirmar no documento oficial.' },
  { q: 'A Trilha Aprova organiza algum destes concursos?', a: 'Não. A Trilha Aprova é uma editora independente de material de estudo. Não temos vínculo com prefeituras, órgãos públicos ou bancas, não recebemos inscrição e não influenciamos a seleção.' },
  { q: 'A data da prova pode mudar?', a: 'Pode. Quando a data aparece marcada como prevista, ela consta do edital de abertura mas ainda depende de edital de convocação. Confirme sempre na página oficial antes de programar seu estudo.' },
  { q: 'Preciso comprar apostila para usar esta parte do site?', a: 'Não. As páginas de concurso e as ferramentas de estudo são gratuitas e não pedem cadastro. As apostilas são vendidas à parte e só aparecem quando existe material para um cargo daquele edital.' }
];

const listaNode = (url, itens) => ({
  '@type': 'ItemList',
  '@id': url + '#lista',
  name: 'Concursos públicos acompanhados pela Trilha Aprova',
  numberOfItems: itens.length,
  itemListElement: itens.map((c, i) => ({
    '@type': 'ListItem', position: i + 1,
    name: c.orgao + (c.edital ? ' — ' + c.edital : ''),
    url: ORIGIN + c.path
  }))
});

/* ---- índice nacional ---- */
{
  const path = '/concursos';
  const abertos = concursosAbertos.length;
  const body =
    ufStrip(null) +
    alertaPrazo(concursos) +
    '<h2>O que está mapeado agora</h2>' +
    `<p>São ${concursos.length} certame(s) em ${estados.length} estado(s), ${abertos ? abertos + ' com inscrição aberta' : 'nenhum com inscrição aberta neste momento'}. Cada ficha traz o link da página oficial e a data em que conferimos.</p>` +
    estados.map(e =>
      `<h3><a href="/concursos/${e.ufSlug}">${esc(e.ufNome)}</a></h3><ul class="municipio-links">` +
      e.municipios.map(m => `<li><a href="${m.path}">${esc(m.municipio)}</a> — ${m.concursos.length} certame(s), ${esc(m.concursos[0].statusLabel.toLowerCase())}</li>`).join('') +
      '</ul>').join('') +
    '<h2>Antes de escolher o que estudar</h2>' +
    '<p>Ler o edital inteiro de uma vez costuma travar mais do que ajudar. O caminho que funciona é transformar o conteúdo programático em lista marcável, distribuir as horas conforme o peso de cada matéria e só então abrir o material.</p>' +
    '<ul>' +
    '<li><a href="/ferramentas/edital-verticalizado">Checklist do edital</a> — responde o que estudar.</li>' +
    '<li><a href="/ferramentas/cronograma-de-estudos">Cronograma por peso</a> — responde quanto tempo dar para cada matéria.</li>' +
    '<li><a href="/ferramentas/calculadora-de-acertos">Calculadora de acertos</a> — responde quantas questões faltam para a sua meta.</li>' +
    '<li><a href="/como-estudar-para-concurso-do-zero">Como estudar do zero</a> — para quem nunca prestou concurso.</li>' +
    '</ul>' +
    disclaimer;

  renderPage({
    path,
    title: 'Concursos públicos por estado e município',
    metaTitle: 'Concursos públicos abertos por estado e município | Trilha Aprova',
    description: 'Concursos públicos por estado e município: edital, banca, prazo de inscrição e data de prova, com link da página oficial de cada órgão.',
    kicker: 'CONCURSOS',
    lead: 'Escolha o estado, depois a cidade. Cada ficha mostra o que o edital diz — banca, prazo de inscrição e data de prova — com o link da página oficial e a data em que a informação foi conferida.',
    keyFacts: [
      ['Certames acompanhados', String(concursos.length)],
      ['Com inscrição aberta', String(concursosAbertos.length)],
      ['Vagas somadas nos certames abertos', concursosAbertos.reduce((s, c) => s + (c.vagas || 0), 0).toLocaleString('pt-BR') +
        (concursosAbertos.filter(c => c.vagas == null).length ? ' (sem contar os que não declaram vagas)' : '')],
      ['Estados', String(estados.length)]
    ],
    body,
    faq: concursoFaq,
    nodes: [listaNode(ORIGIN + path, concursos)],
    styles: ['/concursos.css'],
    scripts: ['/concursos.js'],
    priority: '0.9'
  });
}

/* ---- página de estado ---- */
for (const e of estados) {
  const path = '/concursos/' + e.ufSlug;
  const doEstado = e.municipios.flatMap(m => m.concursos);
  const body =
    ufStrip(e.uf) +
    alertaPrazo(doEstado) +
    '<h2>Cidades com certame mapeado em ' + esc(e.ufNome) + '</h2>' +
    '<ul class="municipio-links">' +
    e.municipios.map(m => `<li><a href="${m.path}">${esc(m.municipio)}</a> — ${m.concursos.length} certame(s), ${esc(m.concursos[0].statusLabel.toLowerCase())}</li>`).join('') +
    '</ul>' +
    '<h2>Certames de ' + esc(e.ufNome) + '</h2>' +
    doEstado.map(c => concursoCard(c)).join('') +
    avisoEdital(e.ufNome, 'concursos:' + e.ufSlug) +
    '<p><a href="/concursos">Ver todos os estados</a> · <a href="/ferramentas">Ferramentas gratuitas de estudo</a></p>' +
    disclaimer;

  renderPage({
    path,
    title: 'Concursos públicos em ' + e.ufNome,
    metaTitle: 'Concursos públicos em ' + e.ufNome + ': editais por município | Trilha Aprova',
    description: `Concursos públicos em ${e.ufNome} por município: banca, edital, prazo de inscrição e data de prova, com link da página oficial de cada órgão.`,
    kicker: 'CONCURSOS / ' + e.uf,
    lead: `Certames de ${e.ufNome} acompanhados pela Trilha Aprova, agrupados por cidade. A informação vem da página oficial de cada órgão e traz a data em que foi conferida.`,
    keyFacts: [['Cidades', String(e.municipios.length)], ['Certames', String(doEstado.length)], ['Com inscrição aberta', String(e.abertos)]],
    body,
    faq: concursoFaq,
    nodes: [listaNode(ORIGIN + path, doEstado)],
    trail: [['Concursos', '/concursos']],
    styles: ['/concursos.css'],
    scripts: ['/concursos.js'],
    priority: '0.8'
  });
}

/* ---- página de município ---- */
for (const e of estados) {
  for (const m of e.municipios) {
    const outras = e.municipios.filter(o => o.municipioSlug !== m.municipioSlug);
    const body =
      ufStrip(e.uf) +
      alertaPrazo(m.concursos) +
      m.concursos.map(c => concursoCard(c, { heading: 'h2' })).join('') +
      '<h2>Como usar esta página</h2>' +
      '<p>Confirme o prazo e a data na página oficial antes de qualquer coisa: é o documento que vale. Depois transforme o conteúdo programático em lista com o <a href="/ferramentas/edital-verticalizado">checklist do edital</a>, distribua suas horas no <a href="/ferramentas/cronograma-de-estudos">cronograma por peso</a>, abra a <a href="/ferramentas/trilha-do-dia">trilha do dia</a> para saber o que estudar hoje e acompanhe o quanto falta para sua meta na <a href="/ferramentas/calculadora-de-acertos">calculadora de acertos</a>. Todas são gratuitas e funcionam dentro do navegador.</p>' +
      avisoEdital(m.municipio, 'concursos:' + e.ufSlug + '/' + m.municipioSlug) +
      (outras.length
        ? '<h2>Outras cidades de ' + esc(e.ufNome) + '</h2><ul class="municipio-links">' +
          outras.map(o => `<li><a href="${o.path}">${esc(o.municipio)}</a></li>`).join('') + '</ul>'
        : '') +
      '<p><a href="/concursos/' + e.ufSlug + '">Ver todos os certames de ' + esc(e.ufNome) + '</a> · <a href="/concursos">Trocar de estado</a></p>' +
      disclaimer;

    renderPage({
      path: m.path,
      title: 'Concursos públicos em ' + m.municipio + ' (' + e.uf + ')',
      metaTitle: 'Concurso público em ' + m.municipio + ' ' + e.uf + ': edital, banca e datas | Trilha Aprova',
      description: `Concursos públicos em ${m.municipio} (${e.uf}): edital, banca, prazo de inscrição e data de prova, com link da página oficial do órgão.`,
      kicker: 'CONCURSOS / ' + e.uf + ' / ' + m.municipio.toUpperCase(),
      lead: `O que os editais de ${m.municipio} dizem hoje: banca, prazo e data de prova. Cada ficha aponta para a página oficial do órgão, que é o documento que vale.`,
      keyFacts: [['Cidade', m.municipio + ' — ' + e.ufNome], ['Certames', String(m.concursos.length)], ['Conferido em', cn.brDate(m.concursos[0].capturedAt)]],
      body,
      faq: concursoFaq,
      nodes: [listaNode(ORIGIN + m.path, m.concursos)],
      trail: [['Concursos', '/concursos'], [e.ufNome, '/concursos/' + e.ufSlug]],
      styles: ['/concursos.css'],
      scripts: ['/concursos.js'],
      priority: '0.8'
    });
  }
}

/* ------------------------------------------------------------------ *
 * Páginas por cidade (Baixada Santista)
 * ------------------------------------------------------------------ */

for (const c of cities) {
  const path = '/' + c.slug;
  const url = ORIGIN + path;
  const others = cities.filter(o => o.slug !== c.slug);

  const body =
    '<h2>Órgãos públicos que abrem seleções em ' + esc(c.city) + '</h2>' +
    '<ul class="orgaos">' + c.orgaos.map(o =>
      `<li><a href="${esc(o.url)}" rel="external nofollow">${esc(o.name)}</a><p>${esc(o.note)}</p></li>`).join('') + '</ul>' +
    c.sections.map(s => `<h2>${esc(s.h2)}</h2>${s.html}`).join('') +
    '<h2>Outras cidades da Baixada Santista</h2><ul class="city-links">' +
    others.map(o => `<li><a href="/${o.slug}">Concursos públicos em ${esc(o.city)}</a></li>`).join('') +
    '</ul><p>Veja também o panorama regional em <a href="/concursos-baixada-santista">como estudar para concursos na Baixada Santista</a>.</p>' +
    '<h2>Apostilas com PDF e audiobook</h2><ul>' + productLinks + '</ul>' +
    disclaimer;

  renderPage({
    path,
    title: `Concursos públicos em ${c.city} (${c.state})`,
    metaTitle: (c.metaTitle || `Concursos públicos em ${c.city} (${c.state})`) + ' | Trilha Aprova',
    description: c.description,
    kicker: `${c.region.toUpperCase()} · ${c.stateName.toUpperCase()}`,
    lead: c.lead,
    keyFacts: c.keyFacts,
    body,
    faq: c.faq,
    nodes: [{
      '@type': 'WebPageElement',
      '@id': url + '#local',
      name: `Preparação para concursos em ${c.city}`,
      about: {
        '@type': 'City',
        name: c.city,
        address: { '@type': 'PostalAddress', addressLocality: c.city, addressRegion: c.state, addressCountry: 'BR' },
        containedInPlace: { '@type': 'AdministrativeArea', name: c.region }
      },
      isPartOf: { '@id': url + '#webpage' }
    }, {
      '@type': 'Service',
      '@id': url + '#service',
      name: `Apostilas para concursos públicos em ${c.city}`,
      serviceType: 'Material digital de preparação para concursos públicos',
      provider: { '@id': ORIGIN + '/#organization' },
      areaServed: { '@type': 'City', name: c.city, addressRegion: c.state, addressCountry: 'BR' },
      audience: { '@type': 'Audience', audienceType: 'Candidatos a concursos públicos' }
    }],
    trail: [['Baixada Santista', '/concursos-baixada-santista']],
    priority: '0.8'
  });
}

/* ------------------------------------------------------------------ *
 * Página de autoria (E-E-A-T)
 * ------------------------------------------------------------------ */

renderPage({
  path: '/sobre',
  title: 'Sobre a Trilha Aprova e a autoria dos materiais',
  metaTitle: 'Sobre a Trilha Aprova | Quem escreve as apostilas',
  description: 'Quem é a Trilha Aprova, quem escreve as apostilas, como os materiais são produzidos e quais são os limites do que prometemos a quem estuda.',
  kicker: 'INSTITUCIONAL',
  lead: `A Trilha Aprova é uma editora digital independente que publica apostilas para concursos públicos em PDF com audiobook. Os materiais são de autoria de ${AUTHOR_NAME} e vendidos em pagamento único, com entrega digital para todo o Brasil. Não temos vínculo com órgãos públicos nem com bancas organizadoras.`,
  keyFacts: [
    ['Autoria dos materiais', AUTHOR_NAME],
    ['Tipo de operação', 'Editora digital independente'],
    ['Vínculo com bancas ou órgãos públicos', 'Nenhum'],
    ['Modelo de venda', 'Compra única por apostila, sem assinatura'],
    ['Atendimento', SUPPORT_EMAIL]
  ],
  body:
    '<h2>O que a Trilha Aprova faz</h2><p>Publicamos materiais de estudo direcionados: cada apostila tem um recorte declarado — uma banca, um conjunto de cargos, um tipo de prova — em vez de tentar cobrir todo o edital de qualquer concurso. O material é entregue em PDF e em audiobook, porque leitura e revisão em áudio resolvem momentos diferentes da rotina de quem estuda trabalhando.</p>' +
    `<h2>Quem escreve</h2><p>Os materiais são escritos por ${esc(AUTHOR_NAME)}, com foco em educação, educação especial e produção textual. O trabalho parte de conteúdos programáticos reais de editais e do estilo de formulação das bancas, organizando os assuntos por contraste — que é onde as provas costumam montar as alternativas parecidas.</p>` +
    '<h2>O que não fazemos</h2><ul><li>Não divulgamos vagas, datas, inscrições abertas ou notas de corte.</li><li>Não publicamos avaliações, depoimentos ou números de aprovação que não possamos comprovar.</li><li>Não prometemos aprovação: nenhum material sério pode fazer isso.</li><li>Não vendemos assinatura nem cobrança recorrente.</li><li>Não temos relação institucional com bancas ou órgãos públicos.</li></ul>' +
    '<h2>Como o conteúdo é revisado</h2><p>Quando um edital é retificado ou uma informação de referência muda, o material e as páginas públicas são corrigidos. As páginas de guia trazem a data da última atualização no rodapé do texto. Se você encontrar algo incorreto, escreva para o atendimento — correções são tratadas como prioridade.</p>' +
    `<h2>Atendimento</h2><p>Dúvidas sobre compra, acesso, reembolso ou conteúdo: <a href="/contato">formulário de contato</a> ou <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. Perdeu o link da sua compra? Use <a href="/recuperar">recuperar minha compra</a> com o mesmo e-mail do pagamento.</p>` +
    '<h2>Materiais publicados</h2><ul>' + productLinks + '</ul>',
  faq: [
    { q: 'A Trilha Aprova é uma banca organizadora?', a: 'Não. Somos uma editora digital independente de materiais de estudo. Não organizamos concursos, não aplicamos provas e não temos vínculo com órgãos públicos ou bancas organizadoras.' },
    { q: 'Quem escreve as apostilas da Trilha Aprova?', a: `Os materiais são de autoria de ${AUTHOR_NAME}, com foco em educação, educação especial e produção textual para concursos públicos.` },
    { q: 'As apostilas garantem aprovação?', a: 'Não. Nenhum material de estudo pode garantir aprovação. A proposta é reduzir dispersão, direcionar a revisão e aumentar a qualidade do estudo, o que melhora as chances sem oferecer qualquer garantia de resultado.' },
    { q: 'Como falo com a Trilha Aprova?', a: `Pelo formulário em /contato ou pelo e-mail ${SUPPORT_EMAIL}. O atendimento também resolve recuperação de acesso e pedidos de reembolso.` }
  ],
  nodes: [{
    '@type': 'AboutPage',
    '@id': ORIGIN + '/sobre#aboutpage',
    mainEntity: { '@id': ORIGIN + '/#organization' }
  }],
  priority: '0.5'
});

/* ------------------------------------------------------------------ *
 * Hub de dúvidas — agrega perguntas de todo o site
 * ------------------------------------------------------------------ */

const hubFaq = [
  { q: 'O que é a Trilha Aprova?', a: 'Uma editora digital independente que publica apostilas para concursos públicos em PDF acompanhadas de audiobook, com entrega digital imediata para todo o Brasil e pagamento único por material.' },
  { q: 'Quanto custa uma apostila?', a: `${brl(products[0].priceCents)} por apostila, em pagamento único. Não há assinatura, mensalidade nem renovação automática.` },
  { q: 'O que vem junto com a apostila?', a: 'O PDF completo, um resumo em áudio e o audiobook dividido em oito capítulos, além das questões com gabarito comentado descritas na página de cada material.' },
  { q: 'Como recebo o material?', a: 'A confirmação do pagamento libera automaticamente uma área individual com os arquivos para leitura, reprodução e download. Não há envio físico nem prazo de entrega.' },
  { q: 'Perdi o link de acesso. E agora?', a: 'Use a opção de recuperar minha compra informando o mesmo e-mail utilizado no pagamento. O acesso é reenviado para esse endereço.' },
  { q: 'Posso pedir reembolso?', a: 'Sim. O Código de Defesa do Consumidor prevê o prazo de 7 dias para o direito de arrependimento em compras pela internet. Solicite pelo canal de atendimento informando o e-mail usado na compra.' },
  { q: 'Vocês divulgam concursos abertos?', a: 'Não. Não publicamos vagas, datas nem inscrições abertas, porque essas informações mudam constantemente e só têm validade no edital oficial do órgão. Nossos guias tratam de preparação e de como ler o edital.' },
  { q: 'As apostilas servem para concursos fora do litoral de São Paulo?', a: 'Servem, conforme o conteúdo. A apostila de redação é de método e se aplica a concursos de nível fundamental em qualquer estado. A apostila de autores tem como referência a banca IBAM e a edição Santos 2026, mas o conteúdo de autores é cobrado em muitos concursos municipais de educação.' },
  { q: 'Audiobook substitui a leitura da apostila?', a: 'Não. O áudio funciona como revisão de conteúdo já lido. Ler, resolver questões e revisar erros continuam sendo as etapas que produzem aprendizado; o áudio aproveita os momentos em que ler é inviável.' },
  { q: 'As apostilas garantem aprovação?', a: 'Não. Nenhum material pode garantir aprovação. O objetivo é direcionar a revisão e melhorar a qualidade do estudo.' }
];

renderPage({
  path: '/perguntas-frequentes',
  title: 'Perguntas frequentes sobre as apostilas e sobre concursos',
  metaTitle: 'Perguntas frequentes | Trilha Aprova',
  description: 'Respostas diretas sobre preço, formato, entrega, reembolso e uso das apostilas da Trilha Aprova, e dúvidas de quem começa a estudar para concurso.',
  kicker: 'CENTRAL DE DÚVIDAS',
  lead: `As apostilas da Trilha Aprova custam ${brl(products[0].priceCents)} cada, em pagamento único, e incluem PDF, resumo em áudio e audiobook em oito capítulos. A entrega é digital e imediata após a confirmação do pagamento, válida em todo o Brasil. Abaixo estão as dúvidas mais frequentes sobre compra, acesso e método de estudo.`,
  keyFacts: [
    ['Preço por apostila', `${brl(products[0].priceCents)}, pagamento único`],
    ['Formatos', 'PDF, resumo em áudio e audiobook em 8 capítulos'],
    ['Prazo de entrega', 'Imediato, após a confirmação do pagamento'],
    ['Direito de arrependimento', '7 dias, conforme o Código de Defesa do Consumidor'],
    ['Atendimento', SUPPORT_EMAIL]
  ],
  body:
    '<h2>Guias completos por assunto</h2><ul>' +
    guides.map(g => `<li><a href="/${g.slug}">${esc(g.title)}</a> — ${esc(g.description)}</li>`).join('') +
    '</ul>' +
    '<h2>Preparação por cidade no litoral de São Paulo</h2><ul class="city-links">' + cityLinks + '</ul>' +
    '<h2>Materiais disponíveis</h2><ul>' + productLinks + '</ul>' +
    '<h2>Ainda com dúvida?</h2>' +
    `<p>Escreva para <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> ou use o <a href="/contato">formulário de contato</a>. Para questões de compra, informe o e-mail usado no pagamento.</p>` +
    disclaimer,
  faq: hubFaq,
  trail: [],
  priority: '0.7'
});

/* ------------------------------------------------------------------ *
 * Home
 * ------------------------------------------------------------------ */

const homeFaq = [
  { q: 'O valor é mensal?', a: `Não. Esta apostila é uma compra única. O valor atual é ${brl(products[0].priceCents)}; o preço de referência de ${brl(products[0].compareAtCents)} aparece riscado.` },
  { q: 'O material garante aprovação?', a: 'Nenhum material sério pode prometer aprovação sozinho. A proposta da Trilha Aprova é reduzir dispersão, melhorar a qualidade da revisão e ajudar você a chegar à prova mais preparado para reconhecer o conteúdo cobrado.' },
  { q: 'Posso baixar o PDF e os áudios?', a: 'Sim. Após a confirmação do pagamento, os formatos incluídos podem ser usados online e baixados na sua área de acesso.' },
  { q: 'E se eu perder meu link?', a: 'Use “Já comprei” no topo da página e recupere o acesso com o mesmo e-mail utilizado na compra.' }
];

const homeTitle = 'Apostilas para concursos com audiobook | Trilha Aprova';
const homeDescription = 'Apostilas em PDF com audiobook para concursos públicos: Autores IBAM para Santos e redação de nível fundamental. Baixada Santista e todo o Brasil.';

const homeNodes = [
  webPageNode(ORIGIN + '/', { title: homeTitle, description: homeDescription, image: COVER, updated: BUILD_DATE, hasFaq: true, hasBreadcrumb: false }),
  faqNode(ORIGIN + '/', homeFaq),
  {
    '@type': 'ItemList',
    '@id': ORIGIN + '/#catalog',
    name: 'Apostilas Trilha Aprova',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: ORIGIN + '/apostilas/' + p.slug, name: p.shortName }))
  }
];

let home = fs.readFileSync('public/index.html', 'utf8')
  .replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/g, '')
  .replace(/<meta name="google-site-verification"[^>]*>/g, '')
  .replace(/<!-- discovery:start -->[\s\S]*?<!-- discovery:end -->/g, '');

home = home
  .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(homeTitle)}</title>`)
  .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(homeDescription)}">`)
  .replace('</head>', seoBlock({ path: '/', title: homeTitle, description: homeDescription, image: COVER, nodes: homeNodes }) + '</head>');

const discovery = '<!-- discovery:start -->' +
  '<section class="section shell seo-discovery">' +
  '<div class="section-heading"><span class="eyebrow">ENCONTRE SUA PRÓXIMA LEITURA</span>' +
  '<h2>Apostilas para concursos com PDF e audiobook</h2>' +
  '<p>Conheça o conteúdo de cada material antes de comprar. Os arquivos são digitais, com acesso em todo o Brasil.</p></div>' +
  `<ul>${productLinks}</ul>` +
  '<h3>Ferramentas gratuitas, sem cadastro</h3>' +
  '<p>Três ferramentas que funcionam dentro do navegador e não pedem e-mail: o checklist do edital responde o que estudar, o cronograma responde quanto tempo dar para cada matéria e a calculadora responde quantas questões faltam para a sua meta.</p>' +
  `<ul>${tools.map(t => `<li><a href="/ferramentas/${t.slug}">${esc(t.title)}</a></li>`).join('')}</ul>` +
  '<p><a href="/ferramentas">Ver todas as ferramentas gratuitas</a></p>' +
  '<h3>Preparação no litoral de São Paulo</h3>' +
  '<p>Estuda para concursos em Santos, São Vicente, Guarujá, Praia Grande ou Cubatão? Cada guia abaixo reúne os órgãos que abrem seleções na cidade, onde conferir o edital oficial e como organizar leitura, exercícios e revisão em áudio.</p>' +
  `<ul class="city-links">${cityLinks}</ul>` +
  '<h3>Guias de estudo</h3>' +
  `<ul>${guides.map(g => `<li><a href="/${g.slug}">${esc(g.title)}</a></li>`).join('')}</ul>` +
  '<h3>Matérias novas toda semana</h3>' +
  '<p>A seção de matérias publica textos sobre método de estudo: leitura de edital, cronograma, revisão, questões e rotina de quem estuda trabalhando.</p>' +
  (articlesNewestFirst.length
    ? `<ul>${articlesNewestFirst.slice(0, 5).map(a => `<li><a href="/materias/${a.slug}">${esc(a.title)}</a></li>`).join('')}</ul>`
    : '') +
  '<p><a href="/materias">Ver todas as matérias</a></p>' +
  '<p><a href="/apostilas-para-concurso">Ver o catálogo completo</a> · <a href="/perguntas-frequentes">Perguntas frequentes</a> · <a href="/sobre">Sobre a Trilha Aprova</a></p>' +
  '</section><!-- discovery:end --></main>';

home = home.replace('</main>', discovery);

/* A prateleira do catálogo vem do catálogo: quando uma apostila entra ou sai,
   a home conta a mesma história que a loja, sem ninguém lembrar de editar. */
const shelf = products.map((p, i) => {
  // "72 páginas • 120 questões" sai dos pontos de prova, que saem do material.
  const medidas = p.proofPoints
    .map(point => /^(\d[\d.,]*\s+\S+)/.exec(point)?.[1])
    .filter(Boolean).slice(0, 2);
  const meta = [...medidas, 'PDF + audiobook'].join(' • ');
  return '<article class="future-card active spotlight-card catalog-product-card">' +
    '<small>APOSTILA ' + String(i + 1).padStart(2, '0') + ' • DISPONÍVEL</small>' +
    '<div class="catalog-card-cover"><img src="' + esc(p.storefront.cover3d) +
      '" alt="Capa da ' + esc(p.shortName) + '" width="240" height="230" loading="lazy" decoding="async"></div>' +
    '<span class="catalog-card-badge">' + esc(p.storefront.badge) + '</span>' +
    '<div class="catalog-card-name">' + esc(p.shortName) + '</div>' +
    '<div class="catalog-card-meta">' + esc(meta) + '</div>' +
    '<div class="catalog-card-price"><del>' + brl(p.compareAtCents) + '</del><strong>' + brl(p.priceCents) + '</strong></div>' +
    '<a class="catalog-card-buy" href="/apostilas/' + esc(p.slug) + '">Ver esta apostila</a></article>';
}).join('');

home = home
  .replace(/<!-- catalogo:intro:start -->[\s\S]*?<!-- catalogo:intro:end -->/,
    '<!-- catalogo:intro:start -->' + esc(products.length === 1
      ? 'Uma apostila publicada. Cada material tem concurso, banca, formatos e oferta próprios.'
      : `São ${products.length} apostilas publicadas. Cada uma tem concurso, banca, formatos e oferta próprios, e só entra aqui com PDF, resumo em áudio e audiobook em capítulos completos.`) + '<!-- catalogo:intro:end -->')
  .replace(/<!-- catalogo:start -->[\s\S]*?<!-- catalogo:end -->/,
    '<!-- catalogo:start -->' + shelf + '<!-- catalogo:end -->');

/* A home abria direto na apostila, como se a primeira pergunta de quem chega
   fosse "qual comprar". Não é: é "tem concurso aberto perto de mim?". Esta
   faixa responde isso antes da vitrine, e cada quadro leva a uma página que
   existe de verdade. Os números saem da base de concursos, não de estimativa —
   por isso mudam sozinhos quando um edital entra ou um prazo vence. */
const ICONES = {
  mapa: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  lista: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="m3 6 2 2 3.5-3.5M3 13l2 2 3.5-3.5M3 20l2 2 3.5-3.5M12 6h9M12 13h9M12 20h9"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.7"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M12 7.2V12l3.2 2"/></svg>',
  fone: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.6" y="13.6" width="4.4" height="6.2" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="17" y="13.6" width="4.4" height="6.2" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  livro: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" d="M4 4.5h6a2.5 2.5 0 0 1 2 1 2.5 2.5 0 0 1 2-1h6v14h-6a2.5 2.5 0 0 0-2 1 2.5 2.5 0 0 0-2-1H4Z"/><path fill="none" stroke="currentColor" stroke-width="1.7" d="M12 5.5v14"/></svg>'
};

const promoSlide = (i, href, icone, eyebrow, titulo, texto, cta) =>
  `<a class="promo-slide" href="${esc(href)}" style="--promo-i:${i}">` +
  `<span class="promo-icon" aria-hidden="true">${ICONES[icone]}</span>` +
  `<span class="promo-text"><span class="promo-eyebrow">${esc(eyebrow)}</span>` +
  `<strong>${esc(titulo)}</strong><span class="promo-sub">${esc(texto)}</span></span>` +
  `<span class="promo-cta">${esc(cta)}</span></a>`;

/* O número de vagas é a única estatística que o site publica sobre si mesmo,
   então ele é somado da própria base e não de lugar nenhum. Certame que não
   declara vagas (cadastro de reserva) fica de fora da soma e é dito em voz
   alta: um total inflado é a forma mais fácil de perder a confiança de quem
   confere. */
const vagasAbertas = concursosAbertos.reduce((s, c) => s + (c.vagas || 0), 0);
const semVagasDeclaradas = concursosAbertos.filter(c => c.vagas == null).length;
const vagasTexto = vagasAbertas.toLocaleString('pt-BR');

const promos = [
  ['/concursos', 'mapa', 'CONCURSOS ABERTOS',
    `${vagasTexto} vagas com inscrição aberta agora.`,
    `Em ${concursosAbertos.length} certames de ${new Set(concursosAbertos.map(c => c.municipio)).size} cidades, somados das páginas oficiais dos órgãos` +
    (semVagasDeclaradas ? ` (${semVagasDeclaradas} deles não declaram número de vagas e ficaram fora da conta)` : '') + '.',
    'Ver por estado e cidade'],
  ['/ferramentas/trilha-do-dia', 'lista', 'FERRAMENTA GRATUITA',
    'Você senta para estudar e não sabe o que abrir.',
    'Diga quanto tempo tem hoje e o peso de cada matéria. A trilha devolve os blocos do dia, começando pelo que mais cai e você menos domina.',
    'Montar a trilha de hoje']
];

/* O terceiro quadro só é um prazo se existir um prazo próximo de verdade.
   Quando não existe, ele vira o que o site sempre tem a oferecer. */
{
  const abertosComData = concursosAbertos.filter(c => c.inscricaoFim);
  const proxima = abertosComData.map(c => c.inscricaoFim).sort()[0];
  const dias = proxima ? cn.daysBetween(BUILD_DATE, proxima) : null;
  if (dias !== null && dias >= 0 && dias <= 14) {
    const naData = abertosComData.filter(c => c.inscricaoFim === proxima);
    const cidades = [...new Set(naData.map(c => c.municipio))];
    promos.push([
      cidades.length === 1 ? naData[0].path : '/concursos', 'relogio', 'PRAZO MAIS PRÓXIMO',
      cn.deadlineNotice({ inscricaoFim: proxima }, BUILD_DATE).text,
      `${naData.length === 1 ? 'Um certame encerra' : naData.length + ' certames encerram'} a inscrição nesta data${cidades.length === 1 ? ' em ' + cidades[0] : ''}. Confirme na página oficial antes de programar o estudo.`,
      naData.length === 1 ? 'Ver a ficha' : 'Ver as fichas'
    ]);
  } else {
    promos.push(['/ferramentas/cronograma-de-estudos', 'relogio', 'FERRAMENTA GRATUITA',
      'Quantas horas dar para cada matéria?',
      'O cronograma distribui as horas que você realmente tem conforme o peso de cada disciplina na prova.',
      'Montar meu cronograma']);
  }
}

const bannersHtml = '<!-- banners:start -->' +
  '<section class="promo-band" aria-label="Por onde começar"><div class="shell">' +
  '<p class="promo-purpose">A Trilha Aprova responde duas perguntas: <strong>qual concurso está aberto perto de você</strong> e <strong>o que estudar primeiro</strong>. O portal de concursos e as ferramentas são gratuitos; as apostilas são vendidas à parte.</p>' +
  '<div class="promo-rail">' + promos.map((p, i) => promoSlide(i, ...p)).join('') + '</div>' +
  '</div></section><!-- banners:end -->';

const atalhoCard = (href, icone, titulo, texto, cta) =>
  `<a class="atalho-card" href="${esc(href)}">` +
  `<span class="atalho-icon" aria-hidden="true">${ICONES[icone]}</span>` +
  `<strong>${esc(titulo)}</strong><span>${esc(texto)}</span>` +
  `<span class="atalho-cta">${esc(cta)}</span></a>`;

const atalhosHtml = '<!-- atalhos:start -->' +
  '<section class="section shell atalhos" aria-label="Gratuito no site"><div class="section-heading">' +
  '<span class="eyebrow">GRATUITO, SEM CADASTRO</span>' +
  '<h2>Nem tudo aqui é para comprar.</h2>' +
  '<p>A parte do site que mais gente usa não custa nada: saber o que está aberto e decidir o que estudar primeiro.</p></div>' +
  '<div class="atalho-grid">' +
  atalhoCard('/concursos', 'mapa', 'Concursos por cidade',
    `${concursos.length} certames com banca, prazo e data de prova, cada um com o link da página oficial do órgão.`, 'Abrir o portal') +
  atalhoCard('/ferramentas', 'lista', `${tools.length === 5 ? 'Cinco' : tools.length} ferramentas de estudo`,
    'Trilha do dia, caderno de erros, checklist do edital, cronograma por peso e calculadora de acertos. Rodam no navegador e não pedem e-mail.', 'Usar agora') +
  atalhoCard('/materias', 'livro', 'Matérias sobre método',
    'Como ler um edital, como revisar e como manter a rotina de quem estuda trabalhando.', 'Ler as matérias') +
  atalhoCard('/como-estudar-com-apostila-e-audiobook', 'fone', 'Estudar ouvindo',
    'Como usar o audiobook no deslocamento sem transformar a escuta em distração.', 'Ver o método') +
  '</div></section><!-- atalhos:end -->';

home = home
  .replace(/<!-- banners:start -->[\s\S]*?<!-- banners:end -->/, bannersHtml)
  .replace(/<!-- atalhos:start -->[\s\S]*?<!-- atalhos:end -->/, atalhosHtml);

fs.writeFileSync('public/index.html', home);

addUrl('/', { priority: '1.0', images: products.map(p => p.storefront.cover3d) });
corpus.unshift({ path: '/', title: homeTitle, description: homeDescription, updated: BUILD_DATE, text: plain(homeDescription + ' ' + homeFaq.map(f => f.q + ' ' + f.a).join(' ')) });

/* ------------------------------------------------------------------ *
 * Páginas institucionais existentes
 * ------------------------------------------------------------------ */

const legalPages = [
  ['contato', 'Atendimento e contato da Trilha Aprova', '0.5',
    'Fale com a Trilha Aprova: dúvidas sobre apostilas, audiobooks, pagamento, acesso aos materiais e recuperação de compra. Atendimento por e-mail, em português.'],
  ['termos', 'Termos de uso e compra', '0.3',
    'Termos de uso e de compra da Trilha Aprova: o que você recebe ao comprar uma apostila digital, regras de uso do material, pagamento e responsabilidades.'],
  ['privacidade', 'Política de privacidade', '0.3',
    'Política de privacidade da Trilha Aprova: quais dados coletamos na compra, como são usados, por quanto tempo ficam guardados e como pedir a exclusão deles.'],
  ['cookies', 'Política de cookies', '0.3',
    'Política de cookies da Trilha Aprova: quais cookies o site usa, para que servem, quais são opcionais e como gerenciar suas preferências a qualquer momento.'],
  ['cancelamentos', 'Cancelamentos e reembolsos', '0.4',
    'Cancelamentos e reembolsos da Trilha Aprova: o prazo de arrependimento de 7 dias previsto no Código de Defesa do Consumidor e como solicitar o estorno.'],
  ['entrega-e-acesso', 'Entrega e acesso aos materiais', '0.4',
    'Entrega e acesso aos materiais da Trilha Aprova: como o PDF e o audiobook chegam após o pagamento, em quanto tempo e o que fazer se você perder o link.']
];

for (const [name, label, priority, description] of legalPages) {
  const file = 'public/' + name + '.html';
  const path = '/' + name;
  let h = fs.readFileSync(file, 'utf8').replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/g, '');
  const title = h.match(/<title>(.*?)<\/title>/)?.[1] || 'Trilha Aprova';
  h = h.replace(/<meta name="description"[^>]*>/g, '')
    .replace('</title>', `</title><meta name="description" content="${esc(description)}">`);
  const nodes = [
    webPageNode(ORIGIN + path, { title, description, image: COVER, updated: BUILD_DATE, hasFaq: false, hasBreadcrumb: true }),
    breadcrumbNode(ORIGIN + path, [['Início', '/'], [label, path]])
  ];
  h = h.replace('</head>', seoBlock({ path, title, description, image: COVER, nodes }) + '</head>');
  fs.writeFileSync(file, h);
  addUrl(path, { priority });
}

/* ------------------------------------------------------------------ *
 * Páginas privadas: noindex
 * ------------------------------------------------------------------ */

for (const name of ['dashboard', 'comprar', 'obrigado', 'recuperar']) {
  const file = 'public/' + name + '.html';
  let h = fs.readFileSync(file, 'utf8')
    .replace(/<meta name="robots"[^>]*>/g, '')
    .replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>');
  fs.writeFileSync(file, h);
}

/* ------------------------------------------------------------------ *
 * /comprar: a página de pagamento precisa falar do produto certo
 *
 * O slug chega por ?produto= e já roteava o pagamento corretamente, mas o
 * texto visível era fixo — quem clicava em "Comprar" na apostila de Inspetor
 * lia a descrição da apostila de Autores. Aqui o catálogo vira um JSON na
 * própria página; o HTML escrito à mão continua sendo o que aparece sem JS.
 * ------------------------------------------------------------------ */

/** Divide um ponto de prova em parte forte e resto, para o olho achar o número. */
function benefit(point) {
  const text = String(point);
  const numeric = /^(\d[\d.,]*\s+\S+)\s+([\s\S]+)$/.exec(text);
  if (numeric) return { strong: numeric[1], rest: numeric[2] };
  const colon = text.indexOf(': ');
  if (colon > 0) return { strong: text.slice(0, colon + 1), rest: text.slice(colon + 2) };
  const dash = text.indexOf(' — ');
  if (dash > 0) return { strong: text.slice(0, dash), rest: text.slice(dash + 1) };
  return { strong: '', rest: text };
}

/** Capa otimizada servida do próprio domínio, quando existe uma. */
const LOCAL_COVER = { 'autores-ibam-2026': '/assets/apostila-santos-ibam-3d.webp' };

function checkoutCover(product) {
  const local = LOCAL_COVER[product.slug];
  if (local) {
    if (!fs.existsSync('public' + local)) throw new Error('Capa local ausente: ' + local);
    return local;
  }
  const url = product.storefront.cover3d;
  return url.startsWith(ORIGIN) ? url.slice(ORIGIN.length) : url;
}

const checkoutProducts = Object.fromEntries(products.map(p => [p.slug, {
  badge: p.storefront.badge,
  nome: p.shortName,
  descricao: p.description,
  publico: p.audience,
  capa: checkoutCover(p),
  alt: 'Capa da apostila ' + p.shortName,
  preco: brl(p.priceCents),
  de: p.compareAtCents ? brl(p.compareAtCents) : '',
  centavos: p.priceCents,
  beneficios: p.proofPoints.slice(0, 4).map(benefit)
}]));

fs.writeFileSync('public/comprar.html',
  fs.readFileSync('public/comprar.html', 'utf8').replace(
    /<!-- produtos:start -->[\s\S]*?<!-- produtos:end -->/,
    '<!-- produtos:start --><script id="produtos-json" type="application/json">' +
    json(checkoutProducts) + '</script><!-- produtos:end -->'));

/* ------------------------------------------------------------------ *
 * sitemap.xml (com lastmod e imagens)
 * ------------------------------------------------------------------ */

const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
  urls.map(u =>
    '  <url><loc>' + ORIGIN + u.loc + '</loc>' +
    '<lastmod>' + u.lastmod + '</lastmod>' +
    '<priority>' + u.priority + '</priority>' +
    [...new Set(u.images)].map(i => '<image:image><image:loc>' + esc(i) + '</image:loc></image:image>').join('') +
    '</url>').join('\n') +
  '\n</urlset>\n';
fs.writeFileSync('public/sitemap.xml', sitemap);

/* ------------------------------------------------------------------ *
 * robots.txt — inclui liberação explícita para rastreadores de IA (GEO)
 * ------------------------------------------------------------------ */

const AI_AGENTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
  'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot',
  'Applebot-Extended', 'Bingbot', 'DuckAssistBot', 'Amazonbot', 'meta-externalagent',
  'CCBot', 'cohere-ai', 'YouBot', 'Diffbot', 'MistralAI-User', 'Bytespider'
];

const robots =
  '# Trilha Aprova — apostilas para concursos públicos\n' +
  '# Conteúdo público liberado para buscadores e para assistentes de IA.\n\n' +
  'User-agent: *\n' +
  'Allow: /\n' +
  'Disallow: /api/\n' +
  'Disallow: /acesso\n' +
  'Disallow: /dashboard\n' +
  'Disallow: /comprar\n' +
  'Disallow: /obrigado\n' +
  'Disallow: /recuperar\n' +
  'Disallow: /gsc/\n\n' +
  AI_AGENTS.map(a => `User-agent: ${a}\nAllow: /\nDisallow: /api/\nDisallow: /acesso\nDisallow: /dashboard\n`).join('\n') +
  '\n' +
  `Sitemap: ${ORIGIN}/sitemap.xml\n`;
fs.writeFileSync('public/robots.txt', robots);

/* ------------------------------------------------------------------ *
 * llms.txt e llms-full.txt (GEO)
 * ------------------------------------------------------------------ */

const llms =
  '# Trilha Aprova\n\n' +
  '> Editora digital independente de apostilas para concursos públicos no Brasil. Cada apostila reúne PDF, resumo em áudio e audiobook em capítulos, ' +
  `por ${brl(products[0].priceCents)} em pagamento único, com entrega digital imediata para todo o país.\n\n` +
  `Autoria: ${AUTHOR_NAME}. Atendimento: ${SUPPORT_EMAIL}. Idioma: português do Brasil.\n` +
  'A Trilha Aprova não é banca organizadora, não tem vínculo com órgãos públicos, não divulga vagas, datas ou inscrições abertas e não promete aprovação.\n' +
  'Foco regional de conteúdo: Baixada Santista, litoral de São Paulo (Santos, São Vicente, Guarujá, Praia Grande e Cubatão). Venda e entrega: todo o Brasil.\n\n' +
  '## Apostilas\n\n' +
  products.map(p => `- [${p.shortName}](${ORIGIN}/apostilas/${p.slug}): ${p.description} Preço: ${brl(p.priceCents)}, pagamento único. Público: ${p.audience}. Referência: ${p.contest}, banca ${p.examBoard}, ${p.edition}.`).join('\n') +
  `\n- [Catálogo completo](${ORIGIN}/apostilas-para-concurso): todas as apostilas disponíveis com PDF e audiobook.\n\n` +
  '## Guias de estudo\n\n' +
  guides.map(g => `- [${g.title}](${ORIGIN}/${g.slug}): ${g.description}`).join('\n') +
  '\n\n## Matérias (atualizadas semanalmente)\n\n' +
  `- [Todas as matérias](${ORIGIN}/materias): seção de conteúdo sobre método de estudo, atualizada toda semana.\n` +
  articlesNewestFirst.map(a => `- [${a.title}](${ORIGIN}/materias/${a.slug}): ${a.description} Publicada em ${a.published}.`).join('\n') +
  '\n\n## Ferramentas gratuitas (sem cadastro, sem envio de dados)\n\n' +
  `- [Todas as ferramentas](${ORIGIN}/ferramentas): ${tools.length} ferramentas que rodam no navegador do usuário, sem cadastro e sem e-mail.\n` +
  tools.map(t => `- [${t.title}](${ORIGIN}/ferramentas/${t.slug}): ${t.description} Gratuita, roda no navegador, os dados ficam no aparelho do usuário.`).join('\n') +
  '\n\n## Concursos por cidade — Baixada Santista (SP)\n\n' +
  cities.map(c => `- [${c.title}](${ORIGIN}/${c.slug}): ${c.description}`).join('\n') +
  '\n\n## Institucional\n\n' +
  `- [Sobre a Trilha Aprova](${ORIGIN}/sobre): quem escreve os materiais, como são produzidos e o que não prometemos.\n` +
  `- [Perguntas frequentes](${ORIGIN}/perguntas-frequentes): preço, formato, entrega, reembolso e método de estudo.\n` +
  `- [Entrega e acesso](${ORIGIN}/entrega-e-acesso): como o material é liberado após a compra.\n` +
  `- [Cancelamentos e reembolsos](${ORIGIN}/cancelamentos): direito de arrependimento de 7 dias (CDC art. 49).\n` +
  `- [Contato](${ORIGIN}/contato): atendimento ao cliente.\n\n` +
  '## Optional\n\n' +
  `- [Termos de uso](${ORIGIN}/termos)\n` +
  `- [Política de privacidade](${ORIGIN}/privacidade)\n` +
  `- [Política de cookies](${ORIGIN}/cookies)\n`;
fs.writeFileSync('public/llms.txt', llms);

const llmsFull =
  '# Trilha Aprova — conteúdo completo\n\n' +
  `Última atualização: ${BUILD_DATE}. Origem: ${ORIGIN}\n\n` +
  corpus.map(c => `---\n\n## ${c.title}\nURL: ${ORIGIN}${c.path}\nAtualizado: ${c.updated}\n\n${c.description}\n\n${c.text}\n`).join('\n');
fs.writeFileSync('public/llms-full.txt', llmsFull);

/* ------------------------------------------------------------------ *
 * feed.xml
 * ------------------------------------------------------------------ */

// As matérias vêm primeiro porque o feed é lido por data e é ele que sinaliza
// a leitores e agregadores que o site tem publicação corrente.
const feedItems = [
  ...articlesNewestFirst.map(a => ({ path: '/materias/' + a.slug, title: a.title, description: a.description, date: a.published })),
  ...guides.map(g => ({ path: '/' + g.slug, title: g.title, description: g.description, date: g.updated || BUILD_DATE })),
  ...cities.map(c => ({ path: '/' + c.slug, title: c.title, description: c.description, date: BUILD_DATE }))];

const feed = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>' +
  '<title>Trilha Aprova — guias de estudo para concursos</title>' +
  `<link>${ORIGIN}/</link>` +
  '<description>Guias de preparação para concursos públicos, com foco na Baixada Santista e em todo o Brasil.</description>' +
  '<language>pt-BR</language>' +
  `<lastBuildDate>${new Date(BUILD_DATE + 'T12:00:00Z').toUTCString()}</lastBuildDate>` +
  `<atom:link href="${ORIGIN}/feed.xml" rel="self" type="application/rss+xml"/>` +
  feedItems.map(i =>
    '<item>' +
    `<title>${esc(i.title)}</title>` +
    `<link>${ORIGIN}${i.path}</link>` +
    `<guid isPermaLink="true">${ORIGIN}${i.path}</guid>` +
    `<description>${esc(i.description)}</description>` +
    `<pubDate>${new Date(i.date + 'T12:00:00Z').toUTCString()}</pubDate>` +
    '</item>').join('') +
  '</channel></rss>\n';
fs.writeFileSync('public/feed.xml', feed);

/* ------------------------------------------------------------------ *
 * IndexNow
 * ------------------------------------------------------------------ *
 * O Google encerrou o ping de sitemap em 2023; o IndexNow é a única notificação
 * ativa que ainda funciona. Vale mais do que parece: quem consome o índice do
 * Bing é o Copilot e parte da busca conectada de assistentes de IA — ou seja,
 * isto é tanto SEO quanto GEO. O protocolo exige que a chave esteja legível em
 * https://host/<chave>.txt, e .txt não é afetado pelo cleanUrls.
 */

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || 'a7f3c19d84b24e6ab05c7d1e93f6428b';
if (!/^[A-Za-z0-9-]{8,128}$/.test(INDEXNOW_KEY)) throw new Error('Invalid IndexNow key');
fs.writeFileSync(`public/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY + '\n');

/* ------------------------------------------------------------------ *
 * Web manifest
 * ------------------------------------------------------------------ */

fs.writeFileSync('public/site.webmanifest', JSON.stringify({
  name: 'Trilha Aprova — apostilas para concursos',
  short_name: 'Trilha Aprova',
  description: 'Apostilas em PDF com audiobook para concursos públicos no Brasil.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  lang: 'pt-BR',
  background_color: '#ffffff',
  theme_color: '#08284f',
  icons: [
    // O SVG cobre qualquer tamanho que o sistema pedir ao instalar o atalho.
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    { src: '/assets/trilha-aprova-logo.webp', sizes: '180x84', type: 'image/webp', purpose: 'any' }
  ]
}, null, 2) + '\n');

/* ------------------------------------------------------------------ *
 * 404
 * ------------------------------------------------------------------ */

fs.writeFileSync('public/404.html',
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Página não encontrada | Trilha Aprova</title>' +
  '<meta name="robots" content="noindex,follow">' +
  '<link rel="stylesheet" href="/legal.css"><link rel="stylesheet" href="/site-footer.css"><link rel="stylesheet" href="/seo.css">' +
  HEADER_CSS_TAG + FAVICON_TAGS +
  '</head><body>' + siteHeader +
  '<main class="guide"><h1>Esta página não existe</h1>' +
  '<p class="answer">O endereço que você abriu não corresponde a nenhuma página da Trilha Aprova. Ele pode ter sido digitado incorretamente ou o conteúdo pode ter mudado de lugar.</p>' +
  '<h2>Para onde ir agora</h2><ul>' +
  `<li><a href="/apostilas-para-concurso">Catálogo de apostilas</a></li>${productLinks}` +
  '<li><a href="/concursos-baixada-santista">Concursos na Baixada Santista</a></li>' +
  '<li><a href="/perguntas-frequentes">Perguntas frequentes</a></li>' +
  '<li><a href="/recuperar">Recuperar minha compra</a></li>' +
  '<li><a href="/contato">Falar com o atendimento</a></li>' +
  '</ul></main>' + footer + '</body></html>');

// O rodapé é a principal malha de links internos do site e cada página estática
// carrega a sua própria cópia. Aqui a cópia é realinhada com lib/site-footer.html
// para que um link novo apareça em todas as páginas de uma vez, sem divergência.
const canonicalFooter = footer.trim();
let footersSynced = 0;
for (const file of fs.readdirSync('public')) {
  if (!file.endsWith('.html')) continue;
  const full = `public/${file}`;
  const html = fs.readFileSync(full, 'utf8');
  const current = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/);
  if (!current || current[0] === canonicalFooter) continue;
  fs.writeFileSync(full, html.replace(current[0], canonicalFooter));
  footersSynced++;
}

/* O cabeçalho segue a mesma lógica do rodapé, e pelo mesmo motivo: ninguém
   entra no site sempre pela home. Quem chega em /termos vindo do Google, ou em
   /obrigado logo depois de comprar, precisa conseguir ir para qualquer lugar
   dali — não apenas voltar para o começo.
   As páginas escritas à mão traziam cada uma o seu próprio header, quase sempre
   só com a logo e um link de volta para a home. Todos eles são removidos e
   substituídos por este; onde não havia header nenhum, ele entra logo depois do
   <body>. */
const SEM_CABECALHO = new Set([
  'dashboard.html' // painel interno: não é site público e não deve puxar visita.
]);
// Cabeçalhos antigos de cada geração do site. Ficam listados para que o build
// consiga reconhecê-los e trocá-los, mesmo os que já não são gerados por aqui.
const CABECALHOS_ANTIGOS = /<header[^>]*class="[^"]*(?:ta-header|legal-header|site-header|store-header)[^"]*"[\s\S]*?<\/header>/g;
let headersSynced = 0;
for (const file of fs.readdirSync('public')) {
  if (!file.endsWith('.html') || SEM_CABECALHO.has(file)) continue;
  const full = `public/${file}`;
  const html = fs.readFileSync(full, 'utf8');
  let novo = html.replace(CABECALHOS_ANTIGOS, '');

  if (!novo.includes(siteHeader)) {
    novo = novo.replace(/<body([^>]*)>/, (_, attrs) => `<body${attrs}>${siteHeader}`);
  }
  // Sem a folha de estilo o menu existe mas não tem forma, então ela entra junto.
  if (!novo.includes(HEADER_CSS_TAG)) novo = novo.replace('</head>', HEADER_CSS_TAG + '</head>');
  // O ícone da aba também: as páginas à mão não passam por renderPage.
  if (!novo.includes('/favicon.svg')) novo = novo.replace('</head>', FAVICON_TAGS + '</head>');
  if (novo === html) continue;

  fs.writeFileSync(full, novo);
  headersSynced++;
}

console.log(`SEO: ${urls.length} URLs públicas, ${products.length} páginas de produto, ${cities.length} páginas de cidade, ${guides.length} guias.`);
console.log(`Rodapé sincronizado a partir de lib/site-footer.html em ${footersSynced} página(s).`);
console.log(`Cabeçalho de navegação sincronizado em ${headersSynced} página(s).`);
console.log('GEO: robots.txt com liberação para rastreadores de IA, llms.txt, llms-full.txt e feed.xml gerados.');
console.log('Arquivos privados e páginas de compra permanecem fora do sitemap e marcados como noindex.');
