const { request, baseUrl } = require('./stripe');
const { getSellableProduct } = require('./catalog');
const { bumpFor } = require('./funnel');

const SITE_ID = 'concurso_audiobook';
const PROJECT_ID = 'concurso_audiobook';
const clean = (value, max = 160) => String(value || '').trim().slice(0, max);

async function createCheckout(req, slug, options = {}) {
  const product = getSellableProduct(slug);
  if (!product) throw new Error('Produto indisponível.');
  const origin = baseUrl(req);
  const analytics = options.analytics || {};
  const consent = options.marketingConsent === true ? 'true' : 'false';
  const embedded = options.embedded === true;

  const params = {
    mode: 'payment',
    customer_creation: 'always',
    locale: 'pt-BR',
    expires_at: String(Math.floor(Date.now() / 1000) + 3600),
    'payment_method_types[0]': 'card',
    // Pix (24/10/2026): 6 of 6 real buyers in Sep–Oct opened a card-only checkout for a R$24.99 apostila and left.
    // Pix is active on the account since 24/10 (verified with a live session); STRIPE_PIX_ENABLED=false turns it off. The webhook fulfils
    // checkout.session.async_payment_succeeded and /obrigado shows "em processamento" while Pix confirms.
    ...(process.env.STRIPE_PIX_ENABLED !== 'false' ? {
      'payment_method_types[1]': 'pix',
      'payment_method_options[pix][expires_after_seconds]': '3600'
    } : {}),
    // Pix exists only in BRL. With Adaptive Pricing on, Stripe opened the checkout in US$ for visitors it
    // located abroad (or behind a VPN) and the Pix option vanished; every product here is priced for Brazil.
    'adaptive_pricing[enabled]': 'false',
    // Funil: guarda o cartão (só cartão; Pix não guarda) para o upsell de 1 clique na página de obrigado.
    'payment_method_options[card][setup_future_usage]': 'off_session',
    'billing_address_collection': 'auto',
    'line_items[0][quantity]': 1,
    'metadata[site_id]': SITE_ID,
    'metadata[project_id]': PROJECT_ID,
    'metadata[product_slug]': product.slug,
    'metadata[marketing_consent]': consent,
    'payment_intent_data[metadata][site_id]': SITE_ID,
    'payment_intent_data[metadata][project_id]': PROJECT_ID,
    'payment_intent_data[metadata][product_slug]': product.slug,
    'payment_intent_data[metadata][marketing_consent]': consent
  };

  if (embedded) {
    params.ui_mode = 'embedded';
    params.return_url = `${origin}/obrigado.html?session_id={CHECKOUT_SESSION_ID}`;
    params.redirect_on_completion = 'always';
  } else {
    params.success_url = `${origin}/obrigado.html?session_id={CHECKOUT_SESSION_ID}`;
    params.cancel_url = `${origin}/comprar.html?produto=${encodeURIComponent(slug)}&cancelado=1`;
  }

  if (options.email) {
    const email = clean(options.email, 240).toLowerCase();
    params.customer_email = email;
    params['payment_intent_data[receipt_email]'] = email;
  }

  for (const [name, value] of Object.entries({
    visitor_id: analytics.visitorId,
    session_id: analytics.sessionId,
    source: analytics.source,
    medium: analytics.medium,
    campaign: analytics.campaign
  })) {
    const v = clean(value, name === 'campaign' ? 240 : 120);
    if (!v) continue;
    params[`metadata[analytics_${name}]`] = v;
    params[`payment_intent_data[metadata][analytics_${name}]`] = v;
  }

  // Oferta (upsell/downsell pago por checkout): o preço vem do servidor (lib/funnel), nunca do navegador.
  const offerCents = Number.isInteger(options.priceCents) && options.priceCents > 0 ? options.priceCents : null;
  if (options.offer) {
    params['metadata[offer]'] = clean(options.offer, 20);
    params['payment_intent_data[metadata][offer]'] = clean(options.offer, 20);
  }
  const stablePrice = offerCents ? null : process.env[product.stripePriceEnv];
  if (stablePrice) {
    params['line_items[0][price]'] = stablePrice;
  } else {
    params['line_items[0][price_data][currency]'] = product.currency;
    params['line_items[0][price_data][unit_amount]'] = offerCents || product.priceCents;
    params['line_items[0][price_data][product_data][name]'] = product.name;
    params['line_items[0][price_data][product_data][description]'] = product.description;
  }

  // Order bump: segunda apostila no mesmo pagamento, com preço especial.
  const bump = options.bump === true ? bumpFor(product.slug) : null;
  if (bump) {
    params['line_items[1][quantity]'] = 1;
    params['line_items[1][price_data][currency]'] = product.currency;
    params['line_items[1][price_data][unit_amount]'] = bump.priceCents;
    params['line_items[1][price_data][product_data][name]'] = bump.name + ' (oferta no checkout)';
    params['metadata[bump_slugs]'] = bump.slug;
    params['payment_intent_data[metadata][bump_slugs]'] = bump.slug;
  }

  return request('/checkout/sessions', { method: 'POST', params });
}

async function createHostedCheckout(req, slug, options = {}) {
  return createCheckout(req, slug, { ...options, embedded: false });
}

module.exports = { SITE_ID, PROJECT_ID, createCheckout, createHostedCheckout };
