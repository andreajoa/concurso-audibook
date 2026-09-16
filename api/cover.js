const { getProduct } = require('../lib/catalog');
const { signObject } = require('../lib/r2');

module.exports = async (req, res) => {
  try {
    const slug = String(req.query?.slug || 'autores-ibam-2026');
    const product = getProduct(slug);
    if (!product) return res.status(404).end('Not found');
    const url = await signObject(product.assets.coverKey, { expiresIn: 60 * 30 });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.statusCode = 302;
    res.setHeader('Location', url);
    return res.end();
  } catch (error) {
    console.error('cover', error);
    return res.status(500).end('Cover unavailable');
  }
};
