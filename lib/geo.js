'use strict';
/* Cidade do comprador (27/11/2026, pedido do André: "tem que estar claro no dashboard").
 *
 * O Pix não traz endereço e o rastreio do navegador só roda com consentimento de cookies,
 * então a cidade é lida no SERVIDOR, pela geolocalização do IP que a borda já envia em
 * cabeçalho (Vercel/NexaCloud x-vercel-ip-*, Cloudflare cf-ip*). Guardamos só "Cidade/UF"
 * — nunca o IP — na própria sessão da Stripe, para segurança da entrega e atendimento.
 * Precisão: cidade do provedor de internet (operadora móvel costuma aparecer como a capital
 * ou um polo como Barueri-SP), não o endereço da pessoa.
 */
function header(req, name) {
  const v = req?.headers?.[name];
  const raw = Array.isArray(v) ? v[0] : String(v || '');
  try { return decodeURIComponent(raw).trim(); } catch { return raw.trim(); }
}

function limpar(texto, max) {
  return String(texto || '').replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** "Goiânia/GO", "SP", "BR" ou '' quando a borda não informou nada. */
function localDoPedido(req) {
  const cidade = limpar(header(req, 'x-vercel-ip-city') || header(req, 'cf-ipcity'), 60);
  const uf = limpar(header(req, 'x-vercel-ip-country-region') || header(req, 'cf-region-code'), 10).toUpperCase();
  const pais = limpar(header(req, 'x-vercel-ip-country') || header(req, 'cf-ipcountry'), 4).toUpperCase();
  const local = cidade && uf ? `${cidade}/${uf}` : cidade || uf;
  if (!local) return pais && pais !== 'XX' ? pais : '';
  return pais && pais !== 'BR' ? `${local} (${pais})` : local;
}

/** Soma um local à lista "A; B; C" sem repetir, cabendo no limite de 500 caracteres da Stripe. */
function somarLocal(lista, local, max = 8) {
  const atuais = String(lista || '').split(';').map(x => x.trim()).filter(Boolean);
  if (!local || atuais.includes(local)) return null;
  let nova = [...atuais, local].slice(-max);
  while (nova.join('; ').length > 480) nova = nova.slice(1);
  return nova.join('; ');
}

module.exports = { localDoPedido, somarLocal };
