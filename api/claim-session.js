const { verifyPurchase } = require('../lib/stripe');

const COOKIE = 'buyer_checkout_session';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sessionId = String(body.session_id || '');
    const purchase = await verifyPurchase(sessionId);
    if (!purchase) return res.status(403).json({ ok: false, error: 'Compra não confirmada.' });
    res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`);
    return res.status(200).json({ ok: true, slug: purchase.slug });
  } catch (error) {
    console.error('claim-session', error);
    return res.status(500).json({ ok: false, error: 'Não foi possível liberar o acesso agora.' });
  }
};
