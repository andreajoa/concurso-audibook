/**
 * Recalcula o aviso de prazo no dia em que a pessoa abre a página.
 *
 * O HTML é gerado no build, então "faltam 5 dias" envelhece sozinho — e um
 * prazo errado numa página de concurso faz alguém perder a inscrição. Aqui o
 * texto é refeito a partir da data ISO que veio no data-prazo. Nada sai do
 * navegador: não há fetch, não há armazenamento, não há rastreio.
 */
(() => {
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const nodes = document.querySelectorAll('[data-prazo]');
  if (!nodes.length) return;

  const hoje = new Date();
  const hojeUTC = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const br = iso => {
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  };

  nodes.forEach(node => {
    const iso = node.getAttribute('data-prazo') || '';
    if (!ISO.test(iso)) return;
    const alvo = Date.parse(iso + 'T00:00:00Z');
    if (Number.isNaN(alvo)) return;

    const dias = Math.round((alvo - hojeUTC) / 86400000);
    let tom = 'open';
    let texto = 'Inscrições até ' + br(iso) + '.';

    if (dias < 0) {
      tom = 'closed';
      texto = 'Inscrições encerradas em ' + br(iso) + '.';
    } else if (dias === 0) {
      tom = 'urgent';
      texto = 'Último dia de inscrição: ' + br(iso) + '.';
    } else if (dias === 1) {
      tom = 'urgent';
      texto = 'Falta 1 dia para o fim das inscrições (' + br(iso) + ').';
    } else if (dias <= 7) {
      tom = 'urgent';
      texto = 'Faltam ' + dias + ' dias para o fim das inscrições (' + br(iso) + ').';
    }

    node.textContent = texto;
    node.classList.remove('prazo-open', 'prazo-urgent', 'prazo-closed');
    node.classList.add('prazo-' + tom);
  });
})();
