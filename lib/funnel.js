/* Funil de vendas (13/11/2026, aprovado pelo André): order bump, upsell e downsell.
   Todos os preços saem daqui, no servidor — o navegador só diz "quero a oferta". */
const { getSellableProduct, getProduct } = require('./catalog');
const catalog = require('../products/catalog.json');

const BUMP_SLUG = 'redacao-nivel-fundamental-2026';
const BUMP_PRICE_CENTS = 1490;            // Redação no checkout: R$ 14,90
const UPSELL_OFF = 0.30;                  // depois de pagar: 30% de desconto
const DOWNSELL_OFF = 0.50;                // se recusar o upsell: 50% de desconto

// arredonda para baixo até terminar em ,90 (R$ 23,47 -> R$ 22,90)
const to90 = cents => Math.max(990, Math.floor((cents - 90) / 100) * 100 + 90);

function bumpFor(mainSlug) {
  if (mainSlug === BUMP_SLUG) return null;
  const p = getSellableProduct(BUMP_SLUG);
  if (!p) return null;
  return { slug: p.slug, name: p.name, shortName: p.shortName, priceCents: BUMP_PRICE_CENTS, fullCents: p.priceCents };
}

function active() {
  return Object.values(catalog).filter(p => p && p.active && getSellableProduct(p.slug));
}

// Upsell: apostila da mesma área (mesma cidade primeiro) que a pessoa ainda não tem.
function upsellProduct(mainSlug, owned = []) {
  const main = getProduct(mainSlug);
  if (!main) return null;
  const area = main.storefront && main.storefront.area;
  const city = main.storefront && main.storefront.concurso && main.storefront.concurso.local;
  const pool = active().filter(p => !owned.includes(p.slug) && p.slug !== mainSlug && p.slug !== BUMP_SLUG);
  // 1º mesma cidade (a pessoa já vai viajar para a prova), 2º mesma área, 3º qualquer outra.
  const rank = p => ((p.storefront.concurso || {}).local === city ? 2 : 0) + (p.storefront.area === area ? 1 : 0);
  return pool.filter(p => p.storefront).sort((a, b) => rank(b) - rank(a))[0] || null;
}

function offerFor(mainSlug, owned = [], kind = 'upsell') {
  const p = upsellProduct(mainSlug, owned);
  if (!p) return null;
  const off = kind === 'downsell' ? DOWNSELL_OFF : UPSELL_OFF;
  return { kind, slug: p.slug, name: p.name, shortName: p.shortName, cover: p.storefront && p.storefront.cover3d,
    fullCents: p.priceCents, priceCents: to90(Math.round(p.priceCents * (1 - off))), percent: Math.round(off * 100) };
}

module.exports = { BUMP_SLUG, BUMP_PRICE_CENTS, bumpFor, offerFor, upsellProduct, to90 };
