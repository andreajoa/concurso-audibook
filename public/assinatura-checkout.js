/**
 * A assinatura do caderno, comprada na própria ferramenta.
 *
 * Não existe página de vendas para isto de propósito. O valor da assinatura só
 * fica evidente depois que a pessoa já anotou alguns erros e percebeu que o
 * caderno mora em um aparelho só; tirá-la dali para uma página de oferta seria
 * interromper exatamente o momento em que a oferta faz sentido.
 *
 * Por isso também o bloco só aparece depois que há erros registrados, e some
 * de vez quando a chave já está guardada: ninguém precisa ver preço de algo
 * que já pagou.
 */
(function () {
  'use strict';

  var bloco = document.querySelector('[data-assinatura]');
  if (!bloco) return;

  var form = bloco.querySelector('[data-assinatura-form]');
  var campo = bloco.querySelector('[data-assinatura-email]');
  var botao = bloco.querySelector('[data-assinatura-botao]');
  var aviso = bloco.querySelector('[data-assinatura-erro]');
  var palco = bloco.querySelector('[data-assinatura-palco]');
  var alvo = bloco.querySelector('[data-assinatura-stripe]');
  var oferta = bloco.querySelector('[data-assinatura-oferta]');

  function estado() {
    return document.documentElement.getAttribute('data-caderno') || '';
  }

  /* O bloco se ajusta ao que a pessoa já fez, e reage sozinho porque o caderno
     muda o atributo no <html> a cada registro — não há como saber de antemão
     se o primeiro erro será anotado antes ou depois deste script carregar. */
  function ajustar() {
    var e = estado();
    bloco.hidden = e !== 'com-erros';
  }
  ajustar();
  try {
    new MutationObserver(ajustar).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-caderno']
    });
  } catch (err) { /* navegador sem MutationObserver: fica no estado inicial */ }

  function erro(texto) {
    aviso.textContent = texto || '';
    aviso.hidden = !texto;
  }

  var config = null;
  function pegarConfig() {
    if (config) return config;
    config = fetch('/api/checkout', { cache: 'no-store' }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Pagamento indisponível.');
        return d;
      });
    });
    return config;
  }

  function carregarStripe() {
    if (window.Stripe) return Promise.resolve();
    return new Promise(function (ok, falhou) {
      var antigo = document.querySelector('script[data-payment-library]');
      if (antigo) {
        antigo.addEventListener('load', ok, { once: true });
        antigo.addEventListener('error', falhou, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.async = true;
      s.dataset.paymentLibrary = '1';
      s.onload = ok;
      s.onerror = function () { falhou(new Error('Biblioteca de pagamento indisponível.')); };
      document.head.appendChild(s);
    });
  }

  var rotulo = botao ? botao.textContent : '';

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = String(campo.value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      erro('Confira o e-mail: é para ele que vai a chave do seu caderno.');
      campo.focus();
      return;
    }
    erro('');
    botao.disabled = true;
    botao.textContent = 'Preparando pagamento seguro…';

    var identidade = {};
    try { identidade = (window.concursoCRM && window.concursoCRM.identity()) || {}; } catch (e) { /* sem analytics */ }

    pegarConfig()
      .then(function (cfg) {
        if (!cfg.embedded || String(cfg.publishableKey || '').indexOf('pk_') !== 0) {
          throw new Error('O pagamento seguro está temporariamente indisponível.');
        }
        return fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: 'caderno-de-erros', email: email, analytics: identidade })
        }).then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok || !d.clientSecret) throw new Error(d.error || 'Não foi possível iniciar o pagamento.');
            return [cfg, d];
          });
        });
      })
      .then(function (par) {
        return carregarStripe().then(function () { return par; });
      })
      .then(function (par) {
        if (oferta) oferta.hidden = true;
        palco.hidden = false;
        palco.scrollIntoView({ block: 'start' });
        return window.Stripe(par[0].publishableKey)
          .initEmbeddedCheckout({ clientSecret: par[1].clientSecret })
          .then(function (checkout) { checkout.mount(alvo); });
      })
      .catch(function (e) {
        console.error(e);
        erro(e && e.message && e.message.length < 180 ? e.message : 'Não foi possível abrir o pagamento agora. Tente novamente.');
        if (oferta) oferta.hidden = false;
        palco.hidden = true;
        botao.disabled = false;
        botao.textContent = rotulo;
      });
  });
})();
