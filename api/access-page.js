const { verifyPurchase } = require('../lib/stripe');
const { getProduct } = require('../lib/catalog');
const { signedProductAssets } = require('../lib/r2');

const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

module.exports = async (req, res) => {
  try {
    const sessionId = String((req.query && req.query.session_id) || '');
    const purchase = await verifyPurchase(sessionId);
    if (!purchase) {
      res.statusCode = 302;
      res.setHeader('Location', '/recuperar.html');
      return res.end();
    }
    const product = getProduct(purchase.slug);
    const assets = await signedProductAssets(product);
    const tracks = assets.tracks.map((track, index) => `<div class="track" data-row="${index}"><button class="track-play" type="button" data-play="${index}" data-src="${esc(track.streamUrl)}">▶</button><div class="track-copy"><b>${esc(track.title)}</b><small>${esc(track.subtitle)}</small></div><a class="track-download" href="${esc(track.downloadUrl)}" aria-label="Baixar ${esc(track.title)}">↓</a></div>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Minha área | Trilha Aprova</title><link rel="stylesheet" href="/store.css"><link rel="stylesheet" href="/trilha.css"></head><body class="portal"><header class="portal-header"><div class="shell"><a href="/" class="ta-brand"><img src="/assets/trilha-aprova-logo.webp" alt="Trilha Aprova" style="width:112px;height:54px;object-fit:contain"></a><a class="button-link alt" style="padding:8px 11px" href="/recuperar.html">Recuperar acesso</a></div></header><main class="portal-main shell"><div class="portal-title"><div><span class="eyebrow">MINHA TRILHA</span><h1>${esc(product.shortName || product.name)}</h1><p style="color:#66717e;margin:0">${esc(product.edition)} • ${esc(product.audience)}</p></div><a class="button-link" href="${esc(assets.pdfDownload)}">↓ Baixar PDF</a></div><div class="portal-grid"><aside class="portal-card"><img class="portal-cover" src="${esc(assets.cover)}" alt="Capa da apostila"><div class="tabs"><button class="active" type="button">▶ Audiobook</button><a class="button-link alt" style="padding:9px 12px" href="${esc(assets.pdf)}" target="_blank" rel="noopener">▤ Abrir PDF</a></div><audio id="portal-player" class="player" controls preload="metadata"></audio><div class="speed"><button data-speed="1" class="active">1×</button><button data-speed="1.25">1.25×</button><button data-speed="1.5">1.5×</button><button data-speed="2">2×</button></div><p id="now-playing" style="font-size:12px;color:#66717e"></p><div class="track-list">${tracks}</div></aside><section class="portal-card"><iframe src="${esc(assets.pdf)}#view=FitH&toolbar=1&navpanes=0" class="pdf-frame" title="Leitor da apostila"></iframe></section></div><p class="legal-note" style="text-align:center;margin-top:22px">Acesso pessoal Trilha Aprova. Os links de arquivo são temporários e vinculados a uma compra validada.</p></main><script>(()=>{const p=document.getElementById('portal-player'),buttons=[...document.querySelectorAll('[data-play]')],rows=[...document.querySelectorAll('[data-row]')];let current=-1,speed=1;function ui(){rows.forEach((r,i)=>{const b=buttons[i],on=i===current,playing=on&&!p.paused&&!p.ended;r.classList.toggle('active',on);b.textContent=playing?'⏸':'▶'});if(current>=0)document.getElementById('now-playing').textContent=(p.paused?'Selecionado: ':'Tocando: ')+rows[current].querySelector('b').textContent}buttons.forEach((b,i)=>b.onclick=()=>{if(i===current){p.paused?p.play():p.pause();return}p.pause();current=i;p.src=b.dataset.src;p.playbackRate=speed;p.load();p.play().catch(()=>{});ui()});document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);p.playbackRate=speed;document.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('active',x===b))});p.onplay=ui;p.onpause=ui;p.onended=()=>{ui();if(current<buttons.length-1)buttons[current+1].click()}})();</script><script src="/analytics-crm.js"></script><script src="/access-tracking.js"></script></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(html);
  } catch (error) {
    console.error('access-page', error);
    return res.status(500).send('Não foi possível carregar seu material agora.');
  }
};
