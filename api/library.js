const { verifyPurchase } = require('../lib/stripe');
const { getProduct, publicProduct } = require('../lib/catalog');
const { signedProductAssets } = require('../lib/r2');

function cookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const item = part.trim();
    if (!item) continue;
    const i = item.indexOf('=');
    if (i < 0) continue;
    out[decodeURIComponent(item.slice(0, i))] = decodeURIComponent(item.slice(i + 1));
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const sessionId = cookies(req).buyer_checkout_session;
    const purchase = await verifyPurchase(sessionId);
    if (!purchase) return res.status(401).json({ authenticated: false });
    const product = getProduct(purchase.slug);
    const assets = await signedProductAssets(product);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      authenticated: true,
      product: publicProduct(product),
      assets
    });
  } catch (error) {
    console.error('library', error);
    return res.status(500).json({ authenticated: false, error: 'Não foi possível carregar sua biblioteca agora.' });
  }
};
