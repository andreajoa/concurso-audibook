// "Espiar": abre a amostra em PDF num pop-up, com botão para baixar.
(function () {
  var modal;
  function open(src, title) {
    if (!modal) {
      modal = document.createElement('dialog');
      modal.className = 'ac-modal';
      modal.innerHTML = '<header><span></span><div><a download>Baixar amostra (PDF)</a><button type="button">Fechar ✕</button></div></header><iframe title="Amostra da apostila"></iframe>';
      document.body.appendChild(modal);
      modal.querySelector('button').addEventListener('click', function () { modal.close(); });
      modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
      modal.addEventListener('close', function () { modal.querySelector('iframe').src = 'about:blank'; });
    }
    modal.querySelector('span').textContent = 'Amostra grátis · ' + title;
    modal.querySelector('a').href = src;
    modal.querySelector('iframe').src = src + '#view=FitH';
    if (typeof modal.showModal === 'function') modal.showModal(); else window.open(src, '_blank');
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-espiar]');
    if (!b) return;
    e.preventDefault();
    // celulares pequenos não mostram PDF dentro da página: abre direto
    if (window.matchMedia('(max-width: 600px)').matches) { window.open(b.getAttribute('data-espiar'), '_blank'); return; }
    open(b.getAttribute('data-espiar'), b.getAttribute('data-titulo') || 'Apostila');
  });
})();
// carrossel de capas: setas rolam um "cartão" por vez
(function () {
  document.querySelectorAll('.ac-carousel').forEach(function (c) {
    var t = c.querySelector('.ac-car-track');
    var step = function (d) { t.scrollBy({ left: d * (t.clientWidth * 0.8), behavior: 'smooth' }); };
    c.querySelector('.ac-car-prev').addEventListener('click', function () { step(-1); });
    c.querySelector('.ac-car-next').addEventListener('click', function () { step(1); });
  });
})();
// carrossel automático: avança sozinho, para com o mouse em cima ou com o foco dentro
(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.ac-car-track').forEach(function (t) {
    var paused = false;
    ['mouseenter', 'focusin', 'touchstart'].forEach(function (ev) { t.parentNode.addEventListener(ev, function () { paused = true; }, { passive: true }); });
    ['mouseleave', 'focusout'].forEach(function (ev) { t.parentNode.addEventListener(ev, function () { paused = false; }); });
    setInterval(function () {
      if (paused || document.hidden) return;
      var item = t.querySelector('.ac-car-item'); var w = item ? item.getBoundingClientRect().width + 18 : 200;
      if (t.scrollLeft + t.clientWidth >= t.scrollWidth - 4) t.scrollTo({ left: 0, behavior: 'smooth' });
      else t.scrollBy({ left: w, behavior: 'smooth' });
    }, 3000);
  });
})();
