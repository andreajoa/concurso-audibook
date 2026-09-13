const catalog = require('../products/catalog.json');
const { sellable } = require('./exam-watch');

/**
 * Produto para entrega. Responde mesmo depois de a apostila sair de venda:
 * quem pagou não perde o acesso porque a prova aconteceu.
 */
function getProduct(slug) {
  return catalog[slug] || null;
}

/**
 * Produto para venda. Some da loja quando é desativado ou quando a prova a que
 * ele serve já passou — a partir daí o material não tem mais uso para quem compra.
 */
function getSellableProduct(slug, now = new Date()) {
  const product = catalog[slug];
  return product && sellable(product, now) ? product : null;
}

function publicProduct(product) {
  if (!product) return null;
  return {
    slug: product.slug,
    name: product.name,
    shortName: product.shortName,
    edition: product.edition,
    author: product.author,
    audience: product.audience,
    currency: product.currency,
    priceCents: product.priceCents,
    compareAtCents: product.compareAtCents,
    description: product.description,
    proofPoints: product.proofPoints
  };
}

module.exports = { catalog, getProduct, getSellableProduct, publicProduct };
