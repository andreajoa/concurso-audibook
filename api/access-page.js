const crypto = require('crypto');
const { verifyPurchase } = require('../lib/stripe');
const { getProduct, catalog } = require('../lib/catalog');
const { rpc } = require('../lib/crm-rpc');
const footer = require('fs').readFileSync(require('path').join(__dirname, '../lib/site-footer.html'), 'utf8');
const { signedProductAssets } = require('../lib/r2');

const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* MODO DONO — ver a entrega por dentro, sem comprar.
 *
 * A dona do site precisa abrir a mesma página que o cliente abre: o mesmo leitor
 * de PDF, o mesmo tocador, as mesmas faixas. Ver um print não serve; a sensação
 * de usar é o que se quer conferir.
 *
 * A credencial NÃO é nova e não está escrita em lugar nenhum deste repositório,
 * que é público: é a mesma senha do painel em /dashboard.html. Quem valida é o
 * banco, pela função crm_dashboard_activity, exatamente como o painel faz. Assim
 * não existe uma segunda senha para guardar, nem uma variável de ambiente nova
 * para alguém configurar, nem um segredo para vazar no GitHub.
 *
 * A senha entra uma vez pela URL e sai dela em seguida: o servidor confere,
 * troca por um passe assinado de 12 horas num cookie HttpOnly e redireciona para
 * um endereço limpo. O passe não carrega a senha dentro dele — é só uma
 * assinatura de validade, feita com um segredo que só o servidor tem. Se esse
 * segredo não estiver configurado, o modo dono simplesmente não abre.
 */
const PASSE = 'ta_dono';

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
  // Comparação de tempo constante: um == comum vaza, byte a byte, o valor certo.
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

function seletorDeApostilas(slugAtual) {
  const itens = Object.values(catalog).map(p =>
    `<a class="button-link${p.slug === slugAtual ? '' : ' alt'}" style="padding:8px 12px;font-size:13px" href="/api/access-page?slug=${encodeURIComponent(p.slug)}">${esc(p.shortName || p.name)}</a>`).join('');
  return '<div class="portal-card" style="margin-bottom:18px"><p style="margin:0 0 10px;font-size:12px;letter-spacing:1.2px;color:#66717e">MODO DONO — VOCÊ ESTÁ VENDO EXATAMENTE A PÁGINA QUE O CLIENTE RECEBE</p>' +
    `<div style="display:flex;flex-wrap:wrap;gap:8px">${itens}</div></div>`;
}

module.exports = async (req, res) => {
  try {
    const consulta = req.query || {};
    const senha = String(consulta.admin || '');

    // Senha na URL: confere, guarda o passe e limpa o endereço.
    if (senha) {
      if (!segredoDoPasse() || !(await senhaDoPainelConfere(senha))) {
        res.statusCode = 302;
        res.setHeader('Location', '/dashboard.html');
        return res.end();
      }
      const passe = assinarPasse(Date.now() + 12 * 60 * 60 * 1000);
      res.setHeader('Set-Cookie', `${PASSE}=${encodeURIComponent(passe)}; HttpOnly; Secure; SameSite=Strict; Path=/api/access-page; Max-Age=43200`);
      res.statusCode = 302;
      res.setHeader('Location', '/api/access-page?slug=' + encodeURIComponent(String(consulta.slug || Object.keys(catalog)[0])));
      return res.end();
    }

    const dono = passeValido(lerCookie(req, PASSE));
    let product = null;
    if (dono) {
      product = getProduct(String(consulta.slug || '')) || getProduct(Object.keys(catalog)[0]);
    } else {
      const sessionId = String(consulta.session_id || '');
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
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Minha área | Trilha Aprova</title><link rel="stylesheet" href="/store.css"><link rel="stylesheet" href="/trilha.css"><link rel="stylesheet" href="/site-footer.css"><link rel="stylesheet" href="/newsletter.css"></head><body class="portal"><header class="portal-header"><div class="shell"><a href="/" class="ta-brand"><img src="/assets/trilha-aprova-logo.webp" alt="Trilha Aprova" style="width:112px;height:54px;object-fit:contain"></a><a class="button-link alt" style="padding:8px 11px" href="/recuperar.html">Recuperar acesso</a></div></header><main class="portal-main shell">${dono ? seletorDeApostilas(product.slug) : ''}<div class="portal-title"><div><span class="eyebrow">MINHA TRILHA</span><h1>${esc(product.shortName || product.name)}</h1><p style="color:#66717e;margin:0">${esc(product.edition)} • ${esc(product.audience)}</p></div><a class="button-link" href="${esc(assets.pdfDownload)}">↓ Baixar PDF</a></div><div class="portal-grid"><aside class="portal-card"><img class="portal-cover" src="${esc(assets.cover)}" alt="Capa da apostila"><div class="tabs"><button class="active" type="button">▶ Audiobook</button><a class="button-link alt" style="padding:9px 12px" href="${esc(assets.pdf)}" target="_blank" rel="noopener">▤ Abrir PDF</a></div><audio id="portal-player" class="player" controls preload="metadata"></audio><div class="speed"><button data-speed="1" class="active">1×</button><button data-speed="1.25">1.25×</button><button data-speed="1.5">1.5×</button><button data-speed="2">2×</button></div><p id="now-playing" style="font-size:12px;color:#66717e"></p><div class="track-list">${tracks}</div></aside><section class="portal-card"><iframe src="${esc(assets.pdf)}#view=FitH&toolbar=1&navpanes=0" class="pdf-frame" title="Leitor da apostila"></iframe></section></div><p class="legal-note" style="text-align:center;margin-top:22px">Acesso pessoal Trilha Aprova. Os links de arquivo são temporários e vinculados a uma compra validada.</p></main>${footer}<script src="/cookie-consent.js" defer></script><script src="/newsletter.js" defer></script><script>(()=>{const p=document.getElementById('portal-player'),buttons=[...document.querySelectorAll('[data-play]')],rows=[...document.querySelectorAll('[data-row]')];let current=-1,speed=1;function ui(){rows.forEach((r,i)=>{const b=buttons[i],on=i===current,playing=on&&!p.paused&&!p.ended;r.classList.toggle('active',on);b.textContent=playing?'⏸':'▶'});if(current>=0)document.getElementById('now-playing').textContent=(p.paused?'Selecionado: ':'Tocando: ')+rows[current].querySelector('b').textContent}buttons.forEach((b,i)=>b.onclick=()=>{if(i===current){p.paused?p.play():p.pause();return}p.pause();current=i;p.src=b.dataset.src;p.playbackRate=speed;p.load();p.play().catch(()=>{});ui()});document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);p.playbackRate=speed;document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b))});p.onplay=ui;p.onpause=ui;p.onended=()=>{ui();if(current<buttons.length-1)buttons[current+1].click()}})();</script>${dono ? '' : '<script src="/analytics-crm.js"></script><script src="/access-tracking.js"></script>'}</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(html);
  } catch (error) {
    console.error('access-page', error);
    return res.status(500).send('Não foi possível carregar seu material agora.');
  }
};
