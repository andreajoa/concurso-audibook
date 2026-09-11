const { createHostedCheckout } = require('../lib/checkout-hosted');
const { getProduct } = require('../lib/catalog');
const { rpc } = require('../lib/crm-rpc');

async function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    const body = await getJsonBody(req);
    const slug = String(body.slug || 'autores-ibam-2026');
    const product = getProduct(slug);
    if (!product) return res.status(400).json({ error: 'Produto indisponível.' });
    const analytics = body.analytics && typeof body.analytics === 'object' ? body.analytics : {};
    const session = await createHostedCheckout(req, slug, { email: body.email, analytics });
    if (body.email) {
      await rpc('crm_mark_checkout', { payload: {
        email: String(body.email).trim().toLowerCase(),
        name: String(body.name || '').trim(),
        whatsapp: String(body.whatsapp || '').replace(/\D/g,''),
        product_slug: slug,
        marketing_consent: body.marketingConsent === true,
        visitor_id: String(analytics.visitorId || ''),
        session_id: String(analytics.sessionId || ''),
        source: String(analytics.source || ''),
        medium: String(analytics.medium || ''),
        campaign: String(analytics.campaign || ''),
        stripe_session_id: session.id,
        amount_total_cents: product.priceCents,
        currency: product.currency
      }}).catch(error => console.error('crm_mark_checkout', error));
    }
    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('checkout', error);
    return res.status(500).json({ error: 'Não foi possível iniciar o pagamento agora. Tente novamente.' });
  }
};
