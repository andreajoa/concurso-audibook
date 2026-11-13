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
