const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Capture the params sent to Stripe instead of calling it.
const stripePath = path.resolve(__dirname, '../lib/stripe.js');
const sent = [];
require.cache[stripePath] = { id: stripePath, filename: stripePath, loaded: true,
  exports: { request: async (url, options) => { sent.push(options.params); return { id: 'cs_test', url: 'https://checkout' }; },
             baseUrl: () => 'https://www.concursotrilhaaprova.online' } };
const { createCheckout } = require('../lib/checkout-hosted');
const req = { headers: { host: 'www.concursotrilhaaprova.online' } };

test('card only when STRIPE_PIX_ENABLED=false', async () => {
  process.env.STRIPE_PIX_ENABLED = 'false';
  await createCheckout(req, 'redacao-nivel-fundamental-2026', { embedded: true });
  const params = sent.at(-1);
  assert.equal(params['payment_method_types[0]'], 'card');
  assert.equal(params['payment_method_types[1]'], undefined);
});

test('Pix joins the checkout by default, expiring with the session', async () => {
  delete process.env.STRIPE_PIX_ENABLED;
  await createCheckout(req, 'redacao-nivel-fundamental-2026', { embedded: true });
  const params = sent.at(-1);
  assert.equal(params['payment_method_types[0]'], 'card');
  assert.equal(params['payment_method_types[1]'], 'pix');
  assert.equal(params['payment_method_options[pix][expires_after_seconds]'], '3600');
  delete process.env.STRIPE_PIX_ENABLED;
});
