const { findPaidPurchasesByEmail, baseUrl } = require('../lib/stripe');
const { getProduct } = require('../lib/catalog');
const { sendAccessEmail } = require('../lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const generic = { ok: true, message: 'Se houver uma compra aprovada para esse e-mail, enviaremos um novo acesso.' };
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(200).json(generic);
    const purchases = await findPaidPurchasesByEmail(email);
    const origin = baseUrl(req);
    for (const purchase of purchases.slice(0, 10)) {
      const product = getProduct(purchase.slug);
      if (!product) continue;
      const accessUrl = `${origin}/acesso?session_id=${encodeURIComponent(purchase.sessionId)}`;
      await sendAccessEmail({ to: email, productName: product.name, accessUrl });
    }
    return res.status(200).json(generic);
  } catch (error) {
    console.error('recover-access', error);
    return res.status(200).json(generic);
  }
};
