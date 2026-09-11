const { request } = require('../lib/stripe');
const { rpc } = require('../lib/crm-rpc');

const SITE_ID = 'concurso_audiobook';
const PROJECT_ID = 'concurso_audiobook';

async function listSessions() {
  const all = [];
  let after = '';
  for (let page = 0; page < 5; page += 1) {
    const params = { limit: 100 };
    if (after) params.starting_after = after;
    const result = await request('/checkout/sessions', { method: 'GET', params });
    const rows = Array.isArray(result.data) ? result.data : [];
    all.push(...rows);
    if (!result.has_more || !rows.length) break;
    after = rows[rows.length - 1].id;
  }
  return all;
}

async function buyerRows(key) {
  const sessions = (await listSessions()).filter(
    session => session.metadata?.site_id === SITE_ID && session.metadata?.project_id === PROJECT_ID
  );
  const ids = sessions.map(session => session.id);
  const usage = ids.length
    ? await rpc('crm_order_usage_batch', { p_admin_key: key, p_sessions: ids })
    : [];
  const usageMap = new Map((Array.isArray(usage) ? usage : []).map(item => [item.stripe_session_id, item]));
  const paidByEmail = new Map();

  for (const session of sessions) {
    const email = String(session.customer_details?.email || session.customer_email || '').toLowerCase();
    if (email && session.payment_status === 'paid') {
      paidByEmail.set(email, (paidByEmail.get(email) || 0) + 1);
    }
  }

  return sessions.slice(0, 100).map(session => {
    const email = String(session.customer_details?.email || session.customer_email || '').toLowerCase();
    const usageRow = usageMap.get(session.id) || {};
    return {
      session_id: session.id,
      name: session.customer_details?.name || '',
      email,
      payment_status: session.payment_status,
      status: session.status,
      amount_total: Number(session.amount_total || 0),
      currency: session.currency || 'brl',
      product_slug: session.metadata?.product_slug || '',
      created_at: new Date(Number(session.created) * 1000).toISOString(),
      purchase_count: paidByEmail.get(email) || 0,
      access_count: Number(usageRow.access_count || 0),
      pdf_downloads: Number(usageRow.pdf_downloads || 0),
      audio_plays: Number(usageRow.audio_plays || 0),
      audio_downloads: Number(usageRow.audio_downloads || 0),
      last_accessed_at: usageRow.last_accessed_at || null,
      source: usageRow.source || session.metadata?.analytics_source || '',
      city: usageRow.city || '',
      region: usageRow.region || '',
      country: usageRow.country || ''
    };
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const key = String(req.headers['x-dashboard-key'] || '');
    if (key.length < 20) return res.status(401).json({ error: 'Acesso negado.' });

    const [summary, breakdown, rows] = await Promise.all([
      rpc('crm_dashboard_snapshot', { p_admin_key: key }),
      rpc('crm_dashboard_breakdown', { p_admin_key: key }),
      buyerRows(key)
    ]);

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json({ summary, breakdown, orders: { rows } });
  } catch (error) {
    console.error('dashboard', error);
    return res.status(401).json({ error: 'Acesso negado.' });
  }
};
