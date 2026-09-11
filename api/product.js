const { getProduct, publicProduct } = require('../lib/catalog');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  const slug = String(req.query?.slug || 'autores-ibam-2026');
  const product = getProduct(slug);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
  return res.status(200).json({ product: publicProduct(product) });
};
