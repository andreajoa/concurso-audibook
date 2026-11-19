// Google Merchant Center (19/11/2026). Toda apostila à venda entra sozinha em
// public/merchant-feed.xml, que o Merchant Center busca uma vez por dia. Este
// teste roda na build (npm run build → npm test) e barra o deploy quando um
// produto novo sairia reprovado: sem imagem, preço diferente da página, texto
// promocional, sem frete digital ou fora das listagens gratuitas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://www.concursotrilhaaprova.online';
const catalog = require('../products/catalog.json');
const feedFile = path.join(ROOT, 'public/merchant-feed.xml');

const decode = s => String(s ?? '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const field = (xml, name) => { const m = new RegExp(`<g:${name}>([\\s\\S]*?)</g:${name}>`).exec(xml); return m ? decode(m[1]) : null; };
const fields = (xml, name) => [...xml.matchAll(new RegExp(`<g:${name}>([\\s\\S]*?)</g:${name}>`, 'g'))].map(m => decode(m[1]));

function readItems() {
  assert.ok(fs.existsSync(feedFile), 'public/merchant-feed.xml não foi gerado (scripts/build-seo.cjs)');
  const xml = fs.readFileSync(feedFile, 'utf8');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0"/);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
}

// Palavras e sinais que o Google trata como texto promocional ou promessa enganosa.
const PROMO = /gr[áa]tis|gratuit|pelo pre[çc]o de|garantid|garantimos|imperd[íi]vel|promo[çc][ãa]o|oferta rel[âa]mpago|[úu]ltimas unidades|s[óo] hoje|compre j[áa]|!|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/iu;

function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length - 9;) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

function localFile(url) {
  assert.ok(url.startsWith(ORIGIN + '/'), `URL fora do domínio verificado no Merchant Center: ${url}`);
  return path.join(ROOT, 'public', decodeURIComponent(new URL(url).pathname));
}

function productLd(html) {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const data = JSON.parse(m[1]);
    const node = (data['@graph'] || [data]).find(n => n['@type'] === 'Product');
    if (node) return node;
  }
  return null;
}

test('todo produto à venda está no feed do Merchant Center, e só eles', () => {
  const items = readItems();
  assert.ok(items.length > 0, 'feed do Merchant Center vazio');
  const ids = items.map(i => field(i, 'id'));
  assert.equal(new Set(ids).size, ids.length, 'g:id repetido no feed');
  const paginas = [
    ...fs.readdirSync(path.join(ROOT, 'public/apostilas')).filter(f => f.endsWith('.html')),
    ...fs.readdirSync(path.join(ROOT, 'public/simulados')).filter(f => f.endsWith('.html'))
  ].map(f => f.replace(/\.html$/, '')).sort();
  assert.deepEqual([...ids].sort(), paginas, 'feed e páginas de produto à venda divergem');
});

test('cada item do feed passa nas regras do Google Merchant Center', () => {
  for (const item of readItems()) {
    const id = field(item, 'id');
    const p = catalog[id];
    const where = `[${id}]`;
    assert.ok(p, `${where} não existe em products/catalog.json`);

    const title = field(item, 'title');
    const description = field(item, 'description');
    assert.ok(title && title.length <= 150, `${where} título vazio ou com mais de 150 caracteres`);
    assert.ok(description && description.length >= 50 && description.length <= 5000, `${where} descrição fora de 50–5000 caracteres`);
    assert.doesNotMatch(title, PROMO, `${where} título com texto promocional: ${title}`);
    assert.doesNotMatch(description, PROMO, `${where} descrição com texto promocional`);
    assert.ok(title === title.trim() && !/\s{2,}/.test(title), `${where} título com espaços sobrando`);

    const price = (p.priceCents / 100).toFixed(2);
    assert.equal(field(item, 'price'), `${price} BRL`, `${where} preço do feed difere do catálogo`);
    assert.equal(field(item, 'availability'), 'in_stock', where);
    assert.equal(field(item, 'condition'), 'new', where);
    assert.equal(field(item, 'brand'), 'Trilha Aprova', where);
    assert.equal(field(item, 'identifier_exists'), 'no', `${where} apostila sem ISBN/GTIN precisa de identifier_exists=no`);
    assert.equal(field(item, 'google_product_category'), '543542', `${where} categoria do Google deve ser Mídia > Livros > E-books`);
    assert.ok(fields(item, 'excluded_destination').includes('Shopping_ads'), `${where} PDF é proibido em anúncios do Shopping: precisa de excluded_destination=Shopping_ads`);
    const shipping = /<g:shipping>([\s\S]*?)<\/g:shipping>/.exec(item);
    assert.ok(shipping, `${where} sem g:shipping`);
    assert.equal(field(shipping[1], 'country'), 'BR', where);
    assert.equal(field(shipping[1], 'price'), '0.00 BRL', `${where} entrega digital tem frete zero`);

    const link = field(item, 'link');
    const pageFile = localFile(link) + '.html';
    assert.ok(fs.existsSync(pageFile), `${where} página do produto não existe: ${link}`);
    const html = fs.readFileSync(pageFile, 'utf8');
    assert.match(html, /<link rel="canonical" href="([^"]+)"/, `${where} página sem canonical`);
    assert.equal(/<link rel="canonical" href="([^"]+)"/.exec(html)[1], link, `${where} canonical da página difere do link do feed`);
    const visivel = 'R$ ' + price.replace('.', ',');
    assert.ok(html.includes(visivel), `${where} a página não mostra o preço ${visivel} que está no feed`);
    assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/, `${where} página de produto com noindex`);

    const ld = productLd(html);
    assert.ok(ld, `${where} página sem dados estruturados de Product`);
    assert.equal(String(ld.offers.price), price, `${where} preço do JSON-LD difere do feed`);
    assert.equal(ld.offers.priceCurrency, 'BRL', where);
    assert.equal(ld.offers.availability, 'https://schema.org/InStock', where);
    assert.ok(ld.offers.shippingDetails, `${where} JSON-LD sem shippingDetails (Search Console avisa)`);
    assert.ok(ld.offers.hasMerchantReturnPolicy, `${where} JSON-LD sem política de devolução`);
    assert.ok(!ld.audience || ld.audience['@type'] === 'PeopleAudience', `${where} audience inválido para o Google`);
    for (const img of [].concat(ld.image || [])) assert.ok(String(img).startsWith(ORIGIN + '/'), `${where} imagem do JSON-LD precisa de URL absoluta`);

    const images = [field(item, 'image_link'), ...fields(item, 'additional_image_link')];
    assert.ok(images[0], `${where} sem image_link`);
    for (const url of images) {
      const file = localFile(url);
      assert.ok(fs.existsSync(file), `${where} imagem não publicada: ${url}`);
      assert.match(file, /\.(webp|png|jpe?g)$/i, `${where} formato de imagem não aceito: ${url}`);
      const size = imageSize(file);
      assert.ok(size, `${where} não consegui ler as dimensões de ${url}`);
      assert.ok(size[0] >= 250 && size[1] >= 250, `${where} imagem pequena demais (${size.join('x')}) para o Google: ${url}`);
    }
  }
});

test('o Google consegue ler produtos, imagens, checkout e políticas', () => {
  const robots = fs.readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8');
  const store = /User-agent: Storebot-Google\n([\s\S]*?)(\n\n|$)/.exec(robots);
  assert.ok(store, 'robots.txt precisa de um grupo para Storebot-Google');
  for (const caminho of ['/apostilas', '/simulados', '/assets', '/comprar', '/merchant-feed.xml'])
    assert.ok(!store[1].split('\n').some(l => l.startsWith('Disallow: ') && caminho.startsWith(l.slice(10).trim())), `Storebot-Google bloqueado em ${caminho}`);
  const geral = /User-agent: \*\n([\s\S]*?)(\n\n|$)/.exec(robots)[1];
  for (const caminho of ['/apostilas', '/simulados', '/assets', '/merchant-feed.xml'])
    assert.ok(!geral.split('\n').some(l => l.startsWith('Disallow: ') && caminho.startsWith(l.slice(10).trim())), `Googlebot bloqueado em ${caminho}`);
  for (const pagina of ['cancelamentos', 'entrega-e-acesso', 'termos', 'privacidade', 'contato', 'sobre'])
    assert.ok(fs.existsSync(path.join(ROOT, 'public', pagina + '.html')), `política obrigatória ausente: /${pagina}`);
});
