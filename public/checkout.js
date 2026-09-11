(() => {
  const buttons = [document.getElementById('buy-button'), document.getElementById('buy-button-bottom')].filter(Boolean);
  const params = new URLSearchParams(location.search);
  const slug = params.get('produto') || 'autores-ibam-2026';

  async function startCheckout(button) {
    const original = button.textContent;
    buttons.forEach(b => { b.disabled = true; });
    button.textContent = 'Abrindo pagamento seguro...';
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug })
      });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Checkout indisponível');
      location.href = data.url;
    } catch (error) {
      console.error(error);
      alert('Não foi possível abrir o pagamento agora. Tente novamente em instantes.');
      buttons.forEach(b => { b.disabled = false; });
      button.textContent = original;
    }
  }

  buttons.forEach(button => button.addEventListener('click', () => startCheckout(button)));

  if (params.get('cancelado') === '1') {
    const note = document.createElement('div');
    note.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:50;background:#fffdf9;border:1px solid #e4d9ca;border-radius:12px;padding:12px 16px;box-shadow:0 12px 34px rgba(7,26,49,.16);font-size:13px;color:#10243d';
    note.textContent = 'Pagamento cancelado. Nenhuma cobrança foi concluída.';
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 5000);
  }
})();
