const { findPaidPurchasesByEmail, baseUrl } = require('../lib/stripe');
const { getProduct } = require('../lib/catalog');
const { sendAccessEmail } = require('../lib/email');
const { linkDeAcesso } = require('../lib/acesso-email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const generic = { ok: true, message: 'Se houver uma compra aprovada para esse e-mail, enviaremos um novo acesso.' };
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(200).json(generic);
    const purchases = await findPaidPurchasesByEmail(email);
    const origin = baseUrl(req);
    // Um e-mail por COMPRA (antes ia um por apostila: compra com order bump recebia 2 iguais).
    // O link leva o token da trava, amarrado à compra e ao e-mail que pagou (lib/acesso-email).
    const porCompra = new Map();
    for (const p of purchases) {
      const product = getProduct(p.slug);
      if (!product) continue;
      const atual = porCompra.get(p.sessionId) || { email: p.email || email, nomes: [] };
      atual.nomes.push(product.name);
      porCompra.set(p.sessionId, atual);
    }
    const janela = Math.floor(Date.now() / (10 * 60 * 1000));
    for (const [sessionId, compra] of [...porCompra].slice(0, 10)) {
      await sendAccessEmail({ to: email, productName: compra.nomes.join(' + '), accessUrl: linkDeAcesso(origin, sessionId, compra.email), idempotencyKey: `recover-${sessionId}-${janela}` });
    }
    return res.status(200).json(generic);
  } catch (error) {
    console.error('recover-access', error);
    return res.status(200).json(generic);
  }
};
