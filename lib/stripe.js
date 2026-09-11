const { getProduct } = require('./catalog');

const API = 'https://api.stripe.com/v1';

function stripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  return key;
}

async function request(path, { method = 'GET', params } = {}) {
  const headers = { Authorization: `Bearer ${stripeKey()}` };
  const init = { method, headers };
  let url = `${API}${path}`;
  if (params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      body.append(key, String(value));
    }
    if (method === 'GET') url += `?${body.toString()}`;
    else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = body.toString();
    }
  }
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Stripe request failed with ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return data;
}

function baseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

async function createCheckoutSession(req, slug) {
  const product = getProduct(slug);
  if (!product) throw new Error('Produto indisponível.');
  const origin = baseUrl(req);
  const stablePrice = process.env[product.stripePriceEnv];
  const params = {
    mode: 'payment',
    success_url: `${origin}/obrigado.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/comprar.html?produto=${encodeURIComponent(slug)}&cancelado=1`,
    customer_creation: 'always',
    'metadata[product_slug]': product.slug,
    'metadata[product_name]': product.shortName,
    'payment_intent_data[metadata][product_slug]': product.slug,
    'line_items[0][quantity]': 1,
    locale: 'pt-BR'
  };

  if (stablePrice) {
    params['line_items[0][price]'] = stablePrice;
  } else {
    params['line_items[0][price_data][currency]'] = product.currency;
    params['line_items[0][price_data][unit_amount]'] = product.priceCents;
    params['line_items[0][price_data][product_data][name]'] = product.name;
    params['line_items[0][price_data][product_data][description]'] = product.description;
  }

  return request('/checkout/sessions', { method: 'POST', params });
}

async function retrieveCheckoutSession(sessionId) {
  return request(`/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    params: { 'expand[]': 'payment_intent.latest_charge' }
  });
}

function sessionEmail(session) {
  return session?.customer_details?.email || session?.customer_email || null;
}

function sessionProduct(session) {
  return session?.metadata?.product_slug || null;
}

function isPaidAndNotRefunded(session) {
  if (!session || session.payment_status !== 'paid') return false;
  const pi = session.payment_intent;
  if (pi && typeof pi === 'object' && pi.latest_charge && typeof pi.latest_charge === 'object') {
    const charge = pi.latest_charge;
    if (charge.refunded) return false;
    if (Number(charge.amount_refunded || 0) >= Number(charge.amount || 0) && Number(charge.amount || 0) > 0) return false;
  }
  return true;
}

async function verifyPurchase(sessionId, expectedSlug) {
  if (!sessionId || !String(sessionId).startsWith('cs_')) return null;
  const session = await retrieveCheckoutSession(sessionId);
  const slug = sessionProduct(session);
  if (!slug || (expectedSlug && slug !== expectedSlug) || !getProduct(slug) || !isPaidAndNotRefunded(session)) return null;
  return { session, slug, email: sessionEmail(session) };
}

async function updateSessionMetadata(sessionId, metadata) {
  const params = {};
  for (const [key, value] of Object.entries(metadata || {})) params[`metadata[${key}]`] = value;
  return request(`/checkout/sessions/${encodeURIComponent(sessionId)}`, { method: 'POST', params });
}

async function findPaidPurchasesByEmail(email) {
  const escaped = String(email || '').trim().toLowerCase().replace(/'/g, "\\'");
  if (!escaped) return [];
  const customers = await request('/customers/search', {
    method: 'GET',
    params: { query: `email:'${escaped}'`, limit: 10 }
  });
  const purchases = [];
  for (const customer of customers.data || []) {
    const sessions = await request('/checkout/sessions', {
      method: 'GET',
      params: { customer: customer.id, limit: 100 }
    });
    for (const session of sessions.data || []) {
      const slug = sessionProduct(session);
      if (!slug || !getProduct(slug) || session.payment_status !== 'paid') continue;
      purchases.push({ sessionId: session.id, slug, email: sessionEmail(session) || customer.email });
    }
  }
  const seen = new Set();
  return purchases.filter(p => {
    const key = `${p.sessionId}:${p.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  request,
  baseUrl,
  createCheckoutSession,
  retrieveCheckoutSession,
  verifyPurchase,
  findPaidPurchasesByEmail,
  updateSessionMetadata,
  sessionEmail,
  sessionProduct,
  isPaidAndNotRefunded
};
