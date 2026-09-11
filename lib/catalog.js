const catalog = require('../products/catalog.json');

function getProduct(slug) {
  const product = catalog[slug];
  if (!product || product.active === false) return null;
  return product;
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

module.exports = { catalog, getProduct, publicProduct };
