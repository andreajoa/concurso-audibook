// Página de venda das apostilas: dias até a prova e barra fixa de compra.
(function () {
  var bar = document.querySelector('.combo-countdown');
  if (bar) {
    var exam = new Date(bar.getAttribute('data-exam') + 'T12:00:00-03:00');
    var days = Math.ceil((exam - Date.now()) / 86400000);
    var out = bar.querySelector('.combo-days');
    if (out) out.textContent = days > 1 ? '· faltam ' + days + ' dias' : days === 1 ? '· falta 1 dia' : '';
  }
  var sticky = document.querySelector('.combo-sticky');
  var hero = document.querySelector('.combo-hero');
  if (!sticky || !hero) return;
  var update = function () {
    sticky.classList.toggle('is-on', hero.getBoundingClientRect().bottom < 0);
  };
  window.addEventListener('scroll', update, { passive: true });
  update();
})();
// clicar numa das 3 capas mostra um resumo do caderno
(function () {
  var pop;
  function show(el) {
    if (!pop) {
      pop = document.createElement('dialog'); pop.className = 'combo-pop';
      pop.innerHTML = '<h3></h3><p></p><div><a class="combo-buy" href="#">Quero o combo completo</a><button type="button">Fechar</button></div>';
      document.body.appendChild(pop);
      pop.querySelector('button').onclick = function () { pop.close(); };
      pop.addEventListener('click', function (e) { if (e.target === pop) pop.close(); });
      var buy = document.querySelector('.combo-buy'); if (buy) pop.querySelector('a').href = buy.getAttribute('href');
    }
    pop.querySelector('h3').textContent = el.getAttribute('data-capa-titulo');
    pop.querySelector('p').textContent = el.getAttribute('data-capa-detalhe') + ' — incluído no combo, junto com o audiobook grátis.';
    if (pop.showModal) pop.showModal();
  }
  document.addEventListener('click', function (e) { var el = e.target.closest && e.target.closest('[data-capa-titulo]'); if (el) show(el); });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-capa-titulo]')) { e.preventDefault(); show(e.target); } });
})();
