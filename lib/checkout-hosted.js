const { request, baseUrl } = require('./stripe');
const { getProduct } = require('./catalog');

const SITE_ID = 'concurso_audiobook';
const PROJECT_ID = 'concurso_audiobook';
const clean = (value, max = 160) => String(value || '').trim().slice(0, max);

async function createHostedCheckout(req, slug, options = {}) {
  const product = getProduct(slug);
  if (!product) throw new Error('Produto indisponível.');
  const origin = baseUrl(req);
  const analytics = options.analytics || {};
  const params = {
    mode: 'payment',
    success_url: `${origin}/obrigado.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/comprar.html?produto=${encodeURIComponent(slug)}&cancelado=1`,
    customer_creation: 'always',
    locale: 'pt-BR',
    'line_items[0][quantity]': 1,
    'metadata[site_id]': SITE_ID,
    'metadata[project_id]': PROJECT_ID,
    'metadata[product_slug]': product.slug,
    'payment_intent_data[metadata][site_id]': SITE_ID,
    'payment_intent_data[metadata][project_id]': PROJECT_ID,
    'payment_intent_data[metadata][product_slug]': product.slug
  };

  if (options.email) params.customer_email = clean(options.email, 240).toLowerCase();
  for (const [name, value] of Object.entries({
    visitor_id: analytics.visitorId,
    session_id: analytics.sessionId,
    source: analytics.source,
    medium: analytics.medium,
    campaign: analytics.campaign
  })) {
    const v = clean(value, name === 'campaign' ? 240 : 120);
    if (v) params[`metadata[analytics_${name}]`] = v;
  }

  const stablePrice = process.env[product.stripePriceEnv];
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

module.exports = { SITE_ID, PROJECT_ID, createHostedCheckout };
