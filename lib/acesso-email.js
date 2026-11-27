'use strict';
/* TRAVA DE ACESSO PELO E-MAIL DA COMPRA (27/11/2026, pedido do André).
 *
 * Antes, quem tivesse o endereço /acesso?session_id=cs_... abria PDF e audiobook — um link
 * encaminhado ou postado num grupo liberava o material para qualquer pessoa.
 *
 * Agora a área do aluno só abre em um navegador que provou ter a caixa de entrada do e-mail
 * usado no pagamento:
 *   1. Os e-mails de acesso levam um token HMAC (&t=...) amarrado à compra E ao e-mail.
 *      Ao abrir, o servidor grava um passe HttpOnly de 30 dias e limpa o token do endereço.
 *   2. O navegador que acabou de pagar (página de obrigado) recebe o passe uma única vez,
 *      nas primeiras 2 horas — o primeiro a abrir fica com ele, e a compra registra isso na Stripe.
 *   3. Qualquer outro caso cai numa tela que envia um link novo SOMENTE para o e-mail da compra
 *      (mostrado mascarado). Digitar o e-mail não libera nada: é preciso abrir a caixa de entrada.
 *   4. LIMITE DE APARELHOS: cada compra libera no máximo MAX_APARELHOS navegadores (padrão 3),
 *      registrados na própria sessão da Stripe (metadata acesso_aparelhos). Encaminhar o e-mail
 *      para outra pessoa não adianta depois que o limite enche. Para liberar um aparelho novo
 *      (cliente trocou de celular), apague o metadata acesso_aparelhos da sessão no painel da Stripe.
 *
 * Por que não por IP: o IP do celular muda a cada troca 4G/Wi-Fi e a operadora reaproveita IPs
 * (CGNAT) — travar por IP bloquearia a própria compradora e liberaria vizinhos de rede.
 *
 * Compras anteriores a TRAVA_DESDE continuam como sempre foram (pedido do André, 27/11/2026).
 */
const crypto = require('crypto');

const COOKIE = 'ta_acesso';
const DIAS_DO_PASSE = 30;
const MAX_COMPRAS_NO_PASSE = 8;
const JANELA_PRIMEIRO_NAVEGADOR_S = 2 * 60 * 60;
const TRAVA_DESDE_S = Math.floor(Date.parse('2026-11-27T19:00:00Z') / 1000);

function maxAparelhos() {
  const n = Number(process.env.ACCESS_MAX_DEVICES || 3);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 3;
}

/** A trava vale só para compras feitas depois que ela entrou no ar. */
function travaAtiva(session) {
  return Number(session?.created || 0) >= TRAVA_DESDE_S;
}

function aparelhosDaCompra(session) {
  return String(session?.metadata?.acesso_aparelhos || '').split(',').map(x => x.trim()).filter(x => /^[A-Za-z0-9_-]{8,24}$/.test(x));
}

/** Registra um aparelho novo na compra. Devolve { aparelho, metadata } ou null se o limite encheu. */
function novoAparelho(session) {
  const lista = aparelhosDaCompra(session);
  if (lista.length >= maxAparelhos()) return null;
  const aparelho = crypto.randomBytes(9).toString('base64url');
  return { aparelho, metadata: { acesso_aparelhos: [...lista, aparelho].join(',') } };
}

function segredo() {
  const base = process.env.ACCESS_LINK_SECRET || process.env.R2_SECRET_ACCESS_KEY || process.env.STRIPE_SECRET_KEY || '';
  return base.length >= 20 ? base : null;
}

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hmac(texto) {
  const s = segredo();
  if (!s) return null;
  return crypto.createHmac('sha256', s).update(texto).digest('base64url');
}

function iguais(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Token do link enviado por e-mail: só quem recebeu o e-mail da compra conhece. */
function tokenDoEmail(sessionId, email) {
  const firma = hmac(`acesso-email.v1|${sessionId}|${normalizarEmail(email)}`);
  return firma ? firma.slice(0, 32) : null;
}

function tokenConfere(sessionId, email, token) {
  if (!sessionId || !normalizarEmail(email) || !token) return false;
  return iguais(token, tokenDoEmail(sessionId, email));
}

/** Endereço que vai nos e-mails. Sem segredo configurado, cai no link simples (a trava manda o link de novo). */
function linkDeAcesso(origin, sessionId, email, slug) {
  const base = `${String(origin || '').replace(/\/$/, '')}/acesso?session_id=${encodeURIComponent(sessionId)}`;
  const t = tokenDoEmail(sessionId, email);
  return base + (slug ? `&slug=${encodeURIComponent(slug)}` : '') + (t ? `&t=${encodeURIComponent(t)}` : '');
}

function lerCookie(req, nome) {
  const bruto = String(req?.headers?.cookie || '');
  for (const parte of bruto.split(';')) {
    const corte = parte.indexOf('=');
    if (corte > 0 && parte.slice(0, corte).trim() === nome) {
      try { return decodeURIComponent(parte.slice(corte + 1).trim()); } catch { return ''; }
    }
  }
  return '';
}

function entradas(req) {
  return lerCookie(req, COOKIE).split('~').map(e => e.split('.')).filter(p => p.length === 4 && p[0].startsWith('cs_'));
}

function firmaDoPasse(sessionId, email, expiraEm, aparelho) {
  const f = hmac(`acesso-passe.v2|${sessionId}|${normalizarEmail(email)}|${expiraEm}|${aparelho}`);
  return f ? f.slice(0, 32) : null;
}

/** O navegador tem passe válido para esta compra, este e-mail e um aparelho ainda registrado na compra? */
function passeValido(req, session, email, agora = Date.now()) {
  const sessionId = session?.id;
  const registrados = aparelhosDaCompra(session);
  for (const [sid, exp, aparelho, firma] of entradas(req)) {
    if (sid !== sessionId || !registrados.includes(aparelho)) continue;
    const expiraEm = Number(exp);
    if (!Number.isFinite(expiraEm) || expiraEm < Math.floor(agora / 1000)) continue;
    if (iguais(firma, firmaDoPasse(sessionId, email, expiraEm, aparelho))) return true;
  }
  return false;
}

/** Valor do Set-Cookie com esta compra somada às outras que o navegador já tinha. */
function cookieDoPasse(req, sessionId, email, aparelho, agora = Date.now()) {
  const expiraEm = Math.floor(agora / 1000) + DIAS_DO_PASSE * 86400;
  const firma = firmaDoPasse(sessionId, email, expiraEm, aparelho);
  if (!firma) return null;
  const outras = entradas(req).filter(([sid, exp]) => sid !== sessionId && Number(exp) > Math.floor(agora / 1000));
  const lista = [[sessionId, String(expiraEm), aparelho, firma], ...outras].slice(0, MAX_COMPRAS_NO_PASSE).map(p => p.join('.')).join('~');
  return `${COOKIE}=${encodeURIComponent(lista)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DIAS_DO_PASSE * 86400}`;
}

/** O navegador que pagou pode reivindicar o passe uma vez, logo depois do pagamento. */
function podeReivindicarPrimeiroNavegador(session, agora = Date.now()) {
  if (!session || aparelhosDaCompra(session).length) return false;
  const criada = Number(session.created || 0);
  return criada > 0 && Math.floor(agora / 1000) - criada <= JANELA_PRIMEIRO_NAVEGADOR_S;
}

function mascararEmail(email) {
  const e = normalizarEmail(email);
  const [usuario, dominio] = e.split('@');
  if (!usuario || !dominio) return 'o e-mail da compra';
  const visivel = usuario.length <= 2 ? usuario[0] : usuario.slice(0, 2);
  return `${visivel}${'•'.repeat(Math.max(3, Math.min(8, usuario.length - visivel.length)))}@${dominio}`;
}

module.exports = {
  COOKIE, TRAVA_DESDE_S, travaAtiva, aparelhosDaCompra, novoAparelho, maxAparelhos, tokenDoEmail, tokenConfere, linkDeAcesso, passeValido, cookieDoPasse,
  podeReivindicarPrimeiroNavegador, mascararEmail, normalizarEmail, segredo
};
