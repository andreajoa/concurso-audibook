const crypto = require('crypto');
const { baseUrl, retrieveCheckoutSession, updateSessionMetadata, isPaidAndNotRefunded, sessionEmail, sessionProduct } = require('../lib/stripe');
const { getProduct } = require('../lib/catalog');
const { sendAccessEmail } = require('../lib/email');

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifyStripeSignature(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(part => {
    const i = part.indexOf('=');
    return [part.slice(0, i), part.slice(i + 1)];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload.toString('utf8')}`).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method not allowed');
  try {
    const payload = await rawBody(req);
    if (!verifyStripeSignature(payload, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).end('Invalid signature');
    }
    const event = JSON.parse(payload.toString('utf8'));
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      return res.status(200).json({ received: true });
    }

    const eventSession = event.data && event.data.object;
    if (!eventSession || !eventSession.id) return res.status(200).json({ received: true });
    const session = await retrieveCheckoutSession(eventSession.id);
    if (!isPaidAndNotRefunded(session)) return res.status(200).json({ received: true });
    if (session.metadata && session.metadata.access_email_sent) return res.status(200).json({ received: true, duplicate: true });

    const slug = sessionProduct(session);
    const product = getProduct(slug);
    const email = sessionEmail(session);
    if (!product || !email) return res.status(200).json({ received: true });

    const accessUrl = `${baseUrl(req)}/acesso.html?session_id=${encodeURIComponent(session.id)}`;
    await sendAccessEmail({ to: email, productName: product.name, accessUrl });
    await updateSessionMetadata(session.id, { access_email_sent: event.id });
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('stripe-webhook', error);
    return res.status(500).end('Webhook error');
  }
};

module.exports.config = { api: { bodyParser: false } };
