// Página de obrigado: upsell (30%) e, se recusar, downsell (50%). Compra com 1 clique no cartão salvo.
(function () {
  var sid = new URLSearchParams(location.search).get('session_id');
  if (!sid) return;
  var host = document.createElement('section');
  host.className = 'funil-box'; host.hidden = true;
  (document.querySelector('main') || document.body).appendChild(host);
  var css = document.createElement('style');
  css.textContent = '.funil-box{max-width:760px;margin:28px auto;padding:22px;border:2px solid #caa65a;border-radius:18px;background:#fffdfa;font-family:system-ui,sans-serif;box-shadow:0 18px 40px rgba(8,40,79,.12)}.funil-in{display:grid;grid-template-columns:150px 1fr;gap:20px;align-items:center}.funil-box img{width:100%;height:auto;filter:drop-shadow(0 12px 14px rgba(0,0,0,.25))}.funil-tag{display:inline-block;background:#b3261e;color:#fff;border-radius:8px;padding:6px 10px;font:800 12px/1 system-ui;letter-spacing:.04em}.funil-box h2{font:400 26px/1.2 Georgia,serif;color:#08284f;margin:10px 0 6px}.funil-box p{color:#334861;margin:0 0 12px;line-height:1.5}.funil-price{font:900 34px/1 system-ui;color:#08284f;margin:6px 0 14px}.funil-actions{display:flex;flex-wrap:wrap;gap:10px}.funil-yes{background:#08284f;color:#fff;border:0;border-radius:12px;padding:16px 20px;font:800 16px/1.1 system-ui;cursor:pointer}.funil-yes:hover{background:#0f3a6e}.funil-no{background:none;border:0;color:#66717e;text-decoration:underline;cursor:pointer;font:600 14px system-ui}.funil-msg{margin-top:10px;font-weight:700;color:#08284f}@media(max-width:600px){.funil-in{grid-template-columns:1fr}.funil-box img{max-width:170px;margin:auto;display:block}}';
  document.head.appendChild(css);
  var brl = function (c) { return 'R$ ' + (c / 100).toFixed(2).replace('.', ','); };

  function render(d) {
    var o = d.offer; if (!o) { host.hidden = true; return; }
    var down = o.kind === 'downsell';
    host.hidden = false;
    host.innerHTML = '<div class="funil-in"><img alt="Capa da apostila ' + o.shortName + '" src="' + o.cover + '"><div>' +
      '<span class="funil-tag">' + (down ? 'ÚLTIMA CHANCE · ' + o.percent + '% DE DESCONTO' : 'OFERTA SÓ NESTA PÁGINA · ' + o.percent + '% DE DESCONTO') + '</span>' +
      '<h2>' + (down ? 'Tudo bem — que tal por um preço ainda menor?' : 'Já que você vai sair de casa para a prova, aproveite e leve também:') + '</h2>' +
      '<p><b>' + o.shortName + '</b> — combo com 3 apostilas + audiobook grátis, liberado na mesma área de acesso.</p>' +
      '<div class="funil-price">' + brl(o.priceCents) + '</div>' +
      '<div class="funil-actions"><button type="button" class="funil-yes">' + (d.oneClick ? 'Sim, quero! Cobrar no cartão final ' + d.card.last4 : 'Sim, quero esta oferta') + '</button>' +
      '<button type="button" class="funil-no">' + (down ? 'Não, obrigado' : 'Não, obrigado') + '</button></div><div class="funil-msg" role="status"></div></div></div>';
    host.querySelector('.funil-yes').onclick = function () {
      var btn = this; btn.disabled = true; btn.textContent = 'Processando…';
      fetch('/api/upsell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sid, kind: o.kind }) })
        .then(function (r) { return r.json(); }).then(function (x) {
          if (x.ok) { host.querySelector('.funil-msg').innerHTML = 'Pronto! A apostila já está na sua área. <a href="' + x.accessUrl + '">Abrir agora</a>'; btn.textContent = 'Comprado ✓'; window.concursoCRM && window.concursoCRM.track && window.concursoCRM.track('upsell_purchase', { product_slug: o.slug, value_cents: o.priceCents }); }
          else if (x.checkoutUrl) { location.href = x.checkoutUrl; }
          else { btn.disabled = false; btn.textContent = 'Tentar de novo'; host.querySelector('.funil-msg').textContent = x.error || 'Não foi possível concluir.'; }
        }).catch(function () { btn.disabled = false; btn.textContent = 'Tentar de novo'; });
    };
    host.querySelector('.funil-no').onclick = function () {
      if (down) { host.hidden = true; return; }
      load('downsell');
    };
  }
  function load(kind, tries) {
    tries = tries || 0;
    fetch('/api/upsell?session_id=' + encodeURIComponent(sid) + '&kind=' + kind, { cache: 'no-store' })
      .then(function (r) { if (r.status === 404 && tries < 8) { setTimeout(function () { load(kind, tries + 1); }, 4000); return null; } return r.json(); })
      .then(function (d) { if (d) render(d); }).catch(function () {});
  }
  load('upsell');
})();
