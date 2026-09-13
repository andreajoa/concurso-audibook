const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('API entrypoints stay within the Vercel Hobby limit', () => {
  const functions = fs.readdirSync(path.join(root, 'api'), { recursive: true })
    .filter((file) => /\.(?:[cm]?js|ts|py|go|rb)$/.test(file));
  assert.ok(functions.length <= 12,
    `${functions.length} API functions exceed the Vercel Hobby limit of 12`);
});

test('scheduled jobs resolve to the shared function and reject unauthenticated requests', async () => {
  const config = require('../vercel.json');
  for (const cron of config.crons) {
    const rewrite = config.rewrites.find((route) => route.source === cron.path);
    assert.ok(rewrite, `${cron.path} needs a rewrite to the shared function`);
    const destination = new URL(rewrite.destination, 'https://example.com');
    assert.equal(destination.pathname, '/api/cron');
    const handler = require('../api/cron');
    const req = { method: 'GET', headers: {}, query: Object.fromEntries(destination.searchParams) };
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler(req, res);
    assert.equal(res.statusCode, 401, `${cron.path} must require CRON_SECRET`);
    assert.deepEqual(res.body, { error: 'Unauthorized' });
  }
});

test('unknown cron jobs are rejected before executing a worker', async () => {
  const handler = require('../api/cron');
  for (const job of [undefined, 'unknown', 'toString', ['editorial', 'marketing']]) {
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler({ method: 'GET', headers: {}, query: { job } }, res);
    assert.equal(res.statusCode, 404);
  }
});

test('authenticated requests select the correct cron worker', async (t) => {
  const handler = require('../api/cron');
  const saved = Object.fromEntries(['CRON_SECRET', 'STRIPE_SECRET_KEY', 'ANTHROPIC_API_KEY']
    .map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.CRON_SECRET = 'cron-test-only';
  process.env.STRIPE_SECRET_KEY = 'stripe-test-only';
  delete process.env.ANTHROPIC_API_KEY;
  const calls = [];
  t.mock.method(global, 'fetch', async (url) => {
    calls.push(url);
    assert.ok(url.startsWith('https://api.stripe.com/v1/checkout/sessions?'));
    return { ok: true, json: async () => ({ data: [], has_more: false }) };
  });
  const run = async (job) => {
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler({ method: 'GET', headers: { authorization: 'Bearer cron-test-only' }, query: { job } }, res);
    return res;
  };
  const marketing = await run('marketing');
  assert.equal(marketing.statusCode, 200);
  assert.deepEqual(marketing.body, { ok: true, delivered: 0, skipped: 0, checked: 0 });
  assert.equal(calls.length, 1);
  const editorial = await run('editorial');
  assert.equal(editorial.statusCode, 500);
  assert.deepEqual(editorial.body, { error: 'missing_env', missing: 'ANTHROPIC_API_KEY' });
  assert.equal(calls.length, 1, 'editorial must not execute the marketing worker');
});
