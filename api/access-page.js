const crypto = require('crypto');
const { verifyPurchase } = require('../lib/stripe');
const { getProduct, catalog } = require('../lib/catalog');
const { rpc } = require('../lib/crm-rpc');
const footer = require('fs').readFileSync(require('path').join(__dirname, '../lib/site-footer.html'), 'utf8');
const { signedProductAssets } = require('../lib/r2');

const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* MODO DONO — ver a entrega por dentro, sem comprar.
 *
 * O endereço de uma apostila pode ser aberto em qualquer computador, celular ou
 * navegador. Se não houver compra validada nem passe de proprietário naquele
 * navegador, a própria página pede a senha do dashboard. A senha é enviada por
 * POST, nunca precisa ficar gravada no link e, depois de validada, o servidor
 * cria um passe HttpOnly de 12 horas e volta para o mesmo URL limpo da apostila.
 *
 * Assim o link permanece portátil sem transformar PDF e audiobook pagos em
 * conteúdo público. O cliente continua entrando pela compra/recuperação normal.
 */
const PASSE = 'ta_dono';
const DURACAO_PASSE_MS = 12 * 60 * 60 * 1000;
const DURACAO_PASSE_SEGUNDOS = Math.floor(DURACAO_PASSE_MS / 1000);

function segredoDoPasse() {
  const base = process.env.R2_SECRET_ACCESS_KEY || process.env.STRIPE_SECRET_KEY || '';
  return base.length >= 20 ? base : null;
}

function assinarPasse(expiraEm) {
  const segredo = segredoDoPasse();
  if (!segredo) return null;
  const firma = crypto.createHmac('sha256', segredo).update('dono.' + expiraEm).digest('base64url');
  return expiraEm + '.' + firma;
}

function passeValido(valor) {
  const partes = String(valor || '').split('.');
  if (partes.length !== 2) return false;
  const expiraEm = Number(partes[0]);
  if (!Number.isFinite(expiraEm) || expiraEm < Date.now()) return false;
  const esperado = assinarPasse(expiraEm);
  if (!esperado) return false;
  const a = Buffer.from(String(valor));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function lerCookie(req, nome) {
  const bruto = String(req.headers.cookie || '');
  for (const parte of bruto.split(';')) {
    const corte = parte.indexOf('=');
    if (corte > 0 && parte.slice(0, corte).trim() === nome) return decodeURIComponent(parte.slice(corte + 1).trim());
  }
  return '';
}

async function senhaDoPainelConfere(senha) {
  if (senha.length < 20 || senha.length > 256) return false;
  try {
    await rpc('crm_dashboard_activity', { p_admin_key: senha, p_days: 1 });
    return true;
  } catch { return false; }
}

async function lerFormulario(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Object.fromEntries(new URLSearchParams(req.body));
  if (Buffer.isBuffer(req.body)) return Object.fromEntries(new URLSearchParams(req.body.toString('utf8')));

  const partes = [];
  let total = 0;
  for await (const pedaco of req) {
    total += pedaco.length;
    if (total > 4096) throw new Error('formulario_grande');
    partes.push(pedaco);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(partes).toString('utf8')));
}

function gravarPasse(res) {
  const passe = assinarPasse(Date.now() + DURACAO_PASSE_MS);
  if (!passe) return false;
  res.setHeader('Set-Cookie', `${PASSE}=${encodeURIComponent(passe)}; HttpOnly; Secure; SameSite=Strict; Path=/api/access-page; Max-Age=${DURACAO_PASSE_SEGUNDOS}`);
  return true;
}

function seletorDeApostilas(slugAtual) {
  const itens = Object.values(catalog).map(p =>
    `<a class="button-link${p.slug === slugAtual ? '' : ' alt'}" style="padding:8px 12px;font-size:13px" href="/api/access-page?slug=${encodeURIComponent(p.slug)}">${esc(p.shortName || p.name)}</a>`).join('');
  return '<div class="portal-card" style="margin-bottom:18px"><p style="margin:0 0 10px;font-size:12px;letter-spacing:1.2px;color:#66717e">MODO DONO — VOCÊ ESTÁ VENDO EXATAMENTE A PÁGINA QUE O CLIENTE RECEBE</p>' +
    `<div style="display:flex;flex-wrap:wrap;gap:8px">${itens}</div></div>`;
}

function telaLoginDono(slug, mensagem = '') {
  const product = getProduct(slug) || getProduct(Object.keys(catalog)[0]);
  const slugSeguro = product ? product.slug : String(slug || '');
  const nome = product ? (product.shortName || product.name) : 'Apostila';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Acesso do proprietário | Trilha Aprova</title><link rel="stylesheet" href="/store.css"><link rel="stylesheet" href="/trilha.css"><link rel="stylesheet" href="/site-footer.css"></head><body class="portal"><header class="portal-header"><div class="shell"><a href="/" class="ta-brand"><img src="/assets/trilha-aprova-logo.webp" alt="Trilha Aprova" style="width:112px;height:54px;object-fit:contain"></a><a class="button-link alt" style="padding:8px 11px" href="/recuperar.html">Recuperar acesso de cliente</a></div></header><main class="portal-main shell" style="max-width:760px"><section class="portal-card" style="margin:42px auto;max-width:560px"><span class="eyebrow">ACESSO DO PROPRIETÁRIO</span><h1 style="margin-bottom:8px">${esc(nome)}</h1><p style="color:#66717e">Este link funciona em qualquer navegador ou dispositivo. Para manter PDFs e audiobooks protegidos, confirme a mesma senha usada no dashboard da Trilha Aprova.</p>${mensagem ? `<p role="alert" style="padding:10px 12px;border-radius:10px;background:#fff1f1;color:#8a1c1c">${esc(mensagem)}</p>` : ''}<form method="post" action="/api/access-page" autocomplete="on"><input type="hidden" name="slug" value="${esc(slugSeguro)}"><label for="senha-dono" style="display:block;font-weight:700;margin:18px 0 7px">Senha do dashboard</label><input id="senha-dono" name="admin" type="password" autocomplete="current-password" required style="width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #cfd6df;border-radius:10px;font:inherit"><button class="button-link" type="submit" style="margin-top:14px;border:0;cursor:pointer">Abrir apostilas e audiobooks</button></form><p class="legal-note" style="margin-top:18px">Depois da validação, este navegador permanece autorizado por 12 horas. Em outro navegador ou aparelho, basta abrir o mesmo link e informar a senha novamente.</p></section></main>${footer}</body></html>`;
}

function responderLoginDono(res, slug, mensagem = '', status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.end(telaLoginDono(slug, mensagem));
}

module.exports = async (req, res) => {
  try {
    const consulta = req.query || {};
    const primeiroSlug = Object.keys(catalog)[0];
    const slugSolicitado = String(consulta.slug || primeiroSlug);

    // Em qualquer navegador, o mesmo link abre um login seguro do proprietário.
    // A senha vai por POST e nunca precisa ser adicionada ao URL compartilhável.
    if (String(req.method || 'GET').toUpperCase() === 'POST') {
      const formulario = await lerFormulario(req);
      const slug = String(formulario.slug || slugSolicitado || primeiroSlug);
      const senha = String(formulario.admin || '');
      if (!segredoDoPasse() || !(await senhaDoPainelConfere(senha))) {
        return responderLoginDono(res, slug, 'Senha não reconhecida. Use a mesma senha do dashboard.', 401);
      }
      if (!gravarPasse(res)) return responderLoginDono(res, slug, 'Não foi possível criar o acesso seguro agora.', 503);
      res.statusCode = 303;
      res.setHeader('Location', '/api/access-page?slug=' + encodeURIComponent(slug));
      return res.end();
    }

    // Compatibilidade com o modo antigo ?admin=...; valida e limpa o endereço.
    const senha = String(consulta.admin || '');
    if (senha) {
      if (!segredoDoPasse() || !(await senhaDoPainelConfere(senha))) {
        return responderLoginDono(res, slugSolicitado, 'Senha não reconhecida. Use a mesma senha do dashboard.', 401);
      }
      if (!gravarPasse(res)) return responderLoginDono(res, slugSolicitado, 'Não foi possível criar o acesso seguro agora.', 503);
      res.statusCode = 302;
      res.setHeader('Location', '/api/access-page?slug=' + encodeURIComponent(slugSolicitado));
      return res.end();
    }

    const dono = passeValido(lerCookie(req, PASSE));
    let product = null;
    if (dono) {
      product = getProduct(slugSolicitado) || getProduct(primeiroSlug);
    } else {
      const sessionId = String(consulta.session_id || '');
      if (!sessionId) return responderLoginDono(res, slugSolicitado);

      const purchase = await verifyPurchase(sessionId);
      if (!purchase) {
        res.statusCode = 302;
        res.setHeader('Location', '/recuperar.html');
        return res.end();
      }
      product = getProduct(purchase.slug);
    }

    const assets = await signedProductAssets(product);
    const tracks = assets.tracks.map((track, index) => `<div class="track" data-row="${index}"><button class="track-play" type="button" data-play="${index}" data-src="${esc(track.streamUrl)}">▶</button><div class="track-copy"><b>${esc(track.title)}</b><small>${esc(track.subtitle)}</small></div><a class="track-download" href="${esc(track.downloadUrl)}" aria-label="Baixar ${esc(track.title)}">↓</a></div>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Minha área | Trilha Aprova</title><link rel="stylesheet" href="/store.css"><link rel="stylesheet" href="/trilha.css"><link rel="stylesheet" href="/site-footer.css"><link rel="stylesheet" href="/newsletter.css"></head><body class="portal"><header class="portal-header"><div class="shell"><a href="/" class="ta-brand"><img src="/assets/trilha-aprova-logo.webp" alt="Trilha Aprova" style="width:112px;height:54px;object-fit:contain"></a><a class="button-link alt" style="padding:8px 11px" href="/recuperar.html">Recuperar acesso</a></div></header><main class="portal-main shell">${dono ? seletorDeApostilas(product.slug) : ''}<div class="portal-title"><div><span class="eyebrow">MINHA TRILHA</span><h1>${esc(product.shortName || product.name)}</h1><p style="color:#66717e;margin:0">${esc(product.edition)} • ${esc(product.audience)}</p></div><a class="button-link" href="${esc(assets.pdfDownload)}">↓ Baixar PDF</a></div><div class="portal-grid"><aside class="portal-card"><img class="portal-cover" src="${esc(assets.cover)}" alt="Capa da apostila"><div class="tabs"><button class="active" type="button">▶ Audiobook</button><a class="button-link alt" style="padding:9px 12px" href="${esc(assets.pdf)}" target="_blank" rel="noopener">▤ Abrir PDF</a></div><audio id="portal-player" class="player" controls preload="metadata"></audio><div class="speed"><button data-speed="1" class="active">1×</button><button data-speed="1.25">1.25×</button><button data-speed="1.5">1.5×</button><button data-speed="2">2×</button></div><p id="now-playing" style="font-size:12px;color:#66717e"></p><div class="track-list">${tracks}</div></aside><section class="portal-card"><iframe src="${esc(assets.pdf)}#view=FitH&toolbar=1&navpanes=0" class="pdf-frame" title="Leitor da apostila"></iframe></section></div><p class="legal-note" style="text-align:center;margin-top:22px">Acesso pessoal Trilha Aprova. Os links de arquivo são temporários e protegidos.</p></main>${footer}<script src="/cookie-consent.js" defer></script><script src="/newsletter.js" defer></script><script>(()=>{const p=document.getElementById('portal-player'),buttons=[...document.querySelectorAll('[data-play]')],rows=[...document.querySelectorAll('[data-row]')];let current=-1,speed=1;function ui(){rows.forEach((r,i)=>{const b=buttons[i],on=i===current,playing=on&&!p.paused&&!p.ended;r.classList.toggle('active',on);b.textContent=playing?'⏸':'▶'});if(current>=0)document.getElementById('now-playing').textContent=(p.paused?'Selecionado: ':'Tocando: ')+rows[current].querySelector('b').textContent}buttons.forEach((b,i)=>b.onclick=()=>{if(i===current){p.paused?p.play():p.pause();return}p.pause();current=i;p.src=b.dataset.src;p.playbackRate=speed;p.load();p.play().catch(()=>{});ui()});document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);p.playbackRate=speed;document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b))});p.onplay=ui;p.onpause=ui;p.onended=()=>{ui();if(current<buttons.length-1)buttons[current+1].click()}})();</script>${dono ? '' : '<script src="/analytics-crm.js"></script><script src="/access-tracking.js"></script>'}</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(html);
  } catch (error) {
    console.error('access-page', error);
    return res.status(500).send('Não foi possível carregar seu material agora.');
  }
};
