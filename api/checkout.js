const { createCheckoutSession } = require('../lib/stripe');

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
    const session = await createCheckoutSession(req, slug);
    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('checkout', error);
    return res.status(500).json({ error: 'Não foi possível iniciar o pagamento agora. Tente novamente.' });
  }
};
