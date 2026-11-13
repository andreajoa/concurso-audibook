/* Clube Trilha Aprova (13/11/2026, pedido do André): 15% na primeira compra, 10% nas seguintes,
   e a lista de e-mails (com consentimento) para avisar de apostila nova.
   Sem tabela nova no banco: o cadastro vai para a lista de novidades do CRM e a condição de membro
   fica num token assinado (cookie ta_membro) entregue pelo link de confirmação enviado por e-mail. */
const crypto = require('crypto');
const { rpc } = require('./crm-rpc');
const { sendMemberEmail } = require('./email');

const COOKIE = 'ta_membro';
const FIRST_OFF = 0.15;
const NEXT_OFF = 0.10;

function secret() {
  const base = process.env.ACCESS_SIGNING_SECRET || process.env.R2_SECRET_ACCESS_KEY || process.env.STRIPE_SECRET_KEY || '';
  if (base.length < 20) throw new Error('member_secret_missing');
  return 'membro:' + base;
}
const b64 = s => Buffer.from(s).toString('base64url');
function tokenFor(email) {
  const e = String(email).trim().toLowerCase();
  return b64(e) + '.' + crypto.createHmac('sha256', secret()).update(e).digest('base64url').slice(0, 32);
}
function emailFromToken(token) {
  try {
    const [p, sig] = String(token || '').split('.');
    const e = Buffer.from(p, 'base64url').toString('utf8');
    const ok = tokenFor(e).split('.')[1];
    return sig && ok.length === sig.length && crypto.timingSafeEqual(Buffer.from(ok), Buffer.from(sig)) ? e : null;
  } catch { return null; }
}
function cookieEmail(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)ta_membro=([^;]+)/);
  return m ? emailFromToken(decodeURIComponent(m[1])) : null;
}

// Desconto do membro para este e-mail: 15% se ainda não comprou, 10% a partir da segunda compra.
async function discountFor(req, email) {
  const member = cookieEmail(req);
  if (!member || member !== String(email || '').trim().toLowerCase()) return null;
  const { findPaidPurchasesByEmail } = require('./stripe');
  const bought = await findPaidPurchasesByEmail(member).catch(() => []);
  const sessions = new Set(bought.map(b => b.sessionId));
  const off = sessions.size ? NEXT_OFF : FIRST_OFF;
  return { email: member, off, percent: Math.round(off * 100), first: !sessions.size };
}

async function signup(req, res, body, origin) {
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 120);
  if (email.length > 240 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.consent !== true)
    return res.status(400).json({ error: 'Informe um e-mail válido e autorize o recebimento das novidades.' });
  await rpc('crm_newsletter_signup', { payload: { email, consent: true, source: 'storefront' } }).catch(e => console.error('membro_crm', e));
  const confirmUrl = `${origin}/api/forms?membro=${encodeURIComponent(tokenFor(email))}`;
  await sendMemberEmail({ to: email, name, confirmUrl });
  return res.status(200).json({ ok: true });
}

function confirm(req, res, token) {
  const email = emailFromToken(token);
  if (!email) { res.statusCode = 302; res.setHeader('Location', '/membros?erro=1'); return res.end(); }
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  res.statusCode = 302; res.setHeader('Location', '/membros?ativo=1'); return res.end();
}

module.exports = { COOKIE, tokenFor, emailFromToken, cookieEmail, discountFor, signup, confirm, FIRST_OFF, NEXT_OFF };
