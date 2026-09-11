const { verifyPurchase } = require('../lib/stripe');
const { getProduct } = require('../lib/catalog');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const sessionId = String((req.query && req.query.session_id) || '');
    const purchase = await verifyPurchase(sessionId);
    if (!purchase) return res.status(200).json({ paid: false });
    const product = getProduct(purchase.slug);
    return res.status(200).json({ paid: true, slug: product.slug, name: product.name });
  } catch (error) {
    console.error('order-status', error);
    return res.status(500).json({ paid: false, error: 'Falha ao consultar o pagamento.' });
  }
};
