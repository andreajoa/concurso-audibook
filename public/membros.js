(function () {
  var q = new URLSearchParams(location.search);
  if (q.get('ativo')) { var ok = document.querySelector('.membro-ok'); if (ok) ok.hidden = false; var f0 = document.getElementById('membro-form'); if (f0) f0.hidden = true; }
  var f = document.getElementById('membro-form'); if (!f) return;
  var msg = f.querySelector('.membro-msg');
  if (q.get('erro')) msg.textContent = 'Link de confirmação inválido. Cadastre-se de novo.';
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = f.elements.name.value.trim(), email = f.elements.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg.textContent = 'Confira o e-mail.'; return; }
    if (!f.elements.consent.checked) { msg.textContent = 'Marque a autorização para receber as novidades.'; return; }
    var b = f.querySelector('button'); b.disabled = true; b.textContent = 'Enviando…';
    fetch('/api/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'membro', name: name, email: email, consent: true, website: f.elements.website.value }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { msg.textContent = 'Enviamos um link para ' + email + '. Abra o e-mail e confirme para ativar o desconto.'; b.textContent = 'Cadastro enviado ✓'; }
        else { msg.textContent = d.error || 'Não foi possível agora.'; b.disabled = false; b.textContent = 'Quero meu desconto de 15%'; }
      }).catch(function () { msg.textContent = 'Falha de conexão. Tente de novo.'; b.disabled = false; b.textContent = 'Quero meu desconto de 15%'; });
  });
})();
