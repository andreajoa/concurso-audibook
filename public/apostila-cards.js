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

// carrossel infinito: desliza sozinho; com o mouse em cima para e deixa rolar (rodinha ou arrastar); ao sair, volta a andar.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.ac-car-track').forEach(function (t) {
    var items = Array.prototype.slice.call(t.children);
    if (!items.length) return;
    // duplica a fila para o laço não ter "pulo" no fim
    items.forEach(function (el) { var c = el.cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.tabIndex = -1; t.appendChild(c); });
    t.style.scrollSnapType = 'none'; t.style.scrollBehavior = 'auto';
    var half = function () { return t.scrollWidth / 2; };
    var paused = false, resumeTimer = null, last = 0;
    var speed = 0.045; // px por ms (~45 px/s)
    function loop(ts) {
      var dt = last ? Math.min(ts - last, 64) : 0; last = ts;
      if (!paused && !reduce && !document.hidden) t.scrollLeft += speed * dt;
      if (t.scrollLeft >= half()) t.scrollLeft -= half();
      if (t.scrollLeft <= 0 && paused) { /* rolando para trás no começo: pula para a cópia */ }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    var box = t.parentNode;
    function pause() { paused = true; clearTimeout(resumeTimer); }
    function resumeSoon(ms) { clearTimeout(resumeTimer); resumeTimer = setTimeout(function () { paused = false; }, ms); }
    box.addEventListener('mouseenter', pause);
    box.addEventListener('mouseleave', function () { resumeSoon(150); dragging = false; });
    box.addEventListener('focusin', pause);
    box.addEventListener('focusout', function () { resumeSoon(1500); });
    box.addEventListener('touchstart', pause, { passive: true });
    box.addEventListener('touchend', function () { resumeSoon(3500); }, { passive: true });
    // rodinha do mouse rola na horizontal enquanto o mouse está em cima
    t.addEventListener('wheel', function (e) {
      var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return; e.preventDefault(); t.scrollLeft += d;
      if (t.scrollLeft < 1) t.scrollLeft += half(); if (t.scrollLeft >= half()) t.scrollLeft -= half();
    }, { passive: false });
    // arrastar com o mouse (sem abrir a capa sem querer)
    var dragging = false, startX = 0, startL = 0, moved = false;
    t.addEventListener('mousedown', function (e) { dragging = true; moved = false; startX = e.pageX; startL = t.scrollLeft; t.style.cursor = 'grabbing'; e.preventDefault(); });
    window.addEventListener('mousemove', function (e) { if (!dragging) return; var dx = e.pageX - startX; if (Math.abs(dx) > 4) moved = true; t.scrollLeft = startL - dx; if (t.scrollLeft < 1) { t.scrollLeft += half(); startL += half(); } if (t.scrollLeft >= half()) { t.scrollLeft -= half(); startL -= half(); } });
    window.addEventListener('mouseup', function () { dragging = false; t.style.cursor = ''; });
    t.addEventListener('click', function (e) { if (moved) { e.preventDefault(); moved = false; } }, true);
    // setas
    var prev = box.querySelector('.ac-car-prev'), next = box.querySelector('.ac-car-next');
    function step(dir) { var w = (t.querySelector('.ac-car-item') || {}).offsetWidth || 170; var to = t.scrollLeft + dir * (w + 30); if (to < 1) to += half(); t.scrollTo({ left: to, behavior: 'smooth' }); }
    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
  });
})();
