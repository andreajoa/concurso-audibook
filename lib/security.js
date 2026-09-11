const crypto = require('crypto');

const COOKIE_NAME = 'study_access';

function secret() {
  const value = process.env.ACCESS_SIGNING_SECRET;
  if (!value || value.length < 32) throw new Error('ACCESS_SIGNING_SECRET is not configured.');
  return value;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signPart(data) {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

function createToken(payload, ttlSeconds = 60 * 60 * 24 * 365 * 5) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = signPart(body);
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = signPart(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [decodeURIComponent(v.slice(0, i)), decodeURIComponent(v.slice(i + 1))];
  }));
}

function setAccessCookie(res, token) {
  const maxAge = 60 * 60 * 24 * 30;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearAccessCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function getCookieAccess(req) {
  return verifyToken(parseCookies(req)[COOKIE_NAME]);
}

module.exports = { COOKIE_NAME, createToken, verifyToken, setAccessCookie, clearAccessCookie, getCookieAccess };
