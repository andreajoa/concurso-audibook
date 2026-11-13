/* Upsell e downsell depois do pagamento (13/11/2026).
   GET  /api/upsell?session_id=cs_...&kind=upsell|downsell  → a oferta para esta compra
   POST /api/upsell {session_id, kind}                       → cobra com 1 clique no cartão salvo;
        sem cartão salvo (ex.: Pix), devolve um link de checkout com o mesmo preço da oferta.
   O preço vem de lib/funnel; o navegador nunca informa valor. */
const { verifyPurchase, updateSessionMetadata, request, baseUrl, sessionSlugs, retrieveCheckoutSession } = require('./stripe');
const { createHostedCheckout } = require('./checkout-hosted');
const { offerFor } = require('./funnel');
const { getProduct } = require('./catalog');
const { sendAccessEmail } = require('./email');

const SITE_ID = 'concurso_audiobook';

async function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = ''; for await (const c of req) raw += c;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

async function savedCard(session) {
  const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!piId) return null;
  const pi = await request(`/payment_intents/${encodeURIComponent(piId)}`, { method: 'GET' });
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id || pi.customer;
  const pm = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id;
  if (!customer || !pm || !String(pm).startsWith('pm_')) return null;
  const method = await request(`/payment_methods/${encodeURIComponent(pm)}`, { method: 'GET' }).catch(() => null);
  if (!method || method.type !== 'card' || !method.customer) return null;   // só cartão guardado para uso futuro
  return { customer, paymentMethod: pm, brand: method.card?.brand, last4: method.card?.last4 };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const q = req.query || {};
    const body = req.method === 'POST' ? await jsonBody(req) : {};
    const sessionId = String(body.session_id || q.session_id || '');
    const kind = String(body.kind || q.kind || 'upsell') === 'downsell' ? 'downsell' : 'upsell';
    const purchase = await verifyPurchase(sessionId);
    if (!purchase) return res.status(404).json({ error: 'Compra não encontrada.' });
    const owned = purchase.slugs;
    const offer = offerFor(purchase.session.metadata.product_slug, owned, kind);
    if (!offer) return res.status(200).json({ offer: null });
    const card = await savedCard(purchase.session).catch(() => null);

    if (req.method === 'GET') {
      return res.status(200).json({ offer, oneClick: Boolean(card), card: card ? { brand: card.brand, last4: card.last4 } : null });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

    if (!card) {
      // Sem cartão salvo: checkout normal com o preço da oferta.
      const co = await createHostedCheckout(req, offer.slug, { email: purchase.email, priceCents: offer.priceCents, offer: kind });
      return res.status(200).json({ checkoutUrl: co.url });
    }

    const pi = await request('/payment_intents', {
      method: 'POST',
      idempotencyKey: `${kind}-${sessionId}-${offer.slug}`,
      params: {
        amount: offer.priceCents, currency: 'brl', customer: card.customer, payment_method: card.paymentMethod,
        off_session: 'true', confirm: 'true', description: `${offer.name} (${kind})`,
        receipt_email: purchase.email || undefined,
        'metadata[site_id]': SITE_ID, 'metadata[project_id]': SITE_ID, 'metadata[product_slug]': offer.slug,
        'metadata[offer]': kind, 'metadata[parent_session]': sessionId
      }
    }).catch(err => ({ error: err }));

    if (pi.error || pi.status !== 'succeeded') {
      // Banco pediu confirmação ou recusou: segue pelo checkout com o mesmo preço.
      const co = await createHostedCheckout(req, offer.slug, { email: purchase.email, priceCents: offer.priceCents, offer: kind });
      return res.status(200).json({ checkoutUrl: co.url, note: 'confirmar_no_checkout' });
    }

    // Libera na mesma área de acesso: a apostila nova entra na lista da compra original.
    const fresh = await retrieveCheckoutSession(sessionId);
    const list = [...new Set([...String(fresh.metadata?.upsell_slugs || '').split(',').filter(Boolean), offer.slug])];
    await updateSessionMetadata(sessionId, { upsell_slugs: list.join(','), [`upsell_pi_${list.length}`]: pi.id });
    const accessUrl = `${baseUrl(req)}/api/access-page?session_id=${encodeURIComponent(sessionId)}&slug=${encodeURIComponent(offer.slug)}`;
    if (purchase.email) await sendAccessEmail({ to: purchase.email, productName: getProduct(offer.slug).name, accessUrl, idempotencyKey: `upsell-access-${pi.id}` }).catch(e => console.error('upsell_email', e));
    return res.status(200).json({ ok: true, accessUrl });
  } catch (error) {
    console.error('upsell', error);
    return res.status(500).json({ error: 'Não foi possível concluir a oferta agora.' });
  }
};
