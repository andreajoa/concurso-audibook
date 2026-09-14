/*
 * Menu do celular.
 *
 * No telefone o cabeçalho antigo empilhava oito links em três linhas e comia
 * 188 px do alto da tela — em toda página, o tempo todo, porque a barra é fixa.
 * Numa tela de 568 px de altura isso é um terço do que a pessoa tem para ler.
 * O botão devolve esse espaço: os links passam a morar atrás dele.
 *
 * A melhoria é progressiva de propósito. O botão está no HTML mas nasce
 * invisível; quem o revela é a classe "js-menu", que só este arquivo aplica.
 * Se o JavaScript não carregar, nada some e nada aparece quebrado: o menu
 * continua sendo a lista de links que já era. O contrário — esconder os links
 * no CSS e contar com o script para trazê-los de volta — deixaria o site sem
 * navegação nenhuma sempre que um arquivo falhasse.
 */
(function () {
  var cabecalho = document.querySelector('.portal-site-header') || document.querySelector('.guide-header');
  if (!cabecalho) return;
  var botao = cabecalho.querySelector('.nav-toggle');
  var menu = cabecalho.querySelector('#menu-do-site');
  if (!botao || !menu) return;

  cabecalho.classList.add('js-menu');

  /* A data da faixa de serviço. Ela vai no HTML com o dia da publicação, que é
     verdade quando o robô lê. Aqui ela passa a ser o dia de hoje, porque entre
     duas publicações a data envelhece e um portal de notícias mostrando
     anteontem no alto da página parece abandonado. */
  var campoData = cabecalho.querySelector('[data-data-de-hoje]');
  if (campoData) {
    try {
      var hoje = new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      }).format(new Date());
      campoData.textContent = hoje.charAt(0).toUpperCase() + hoje.slice(1);
    } catch (e) { /* sem Intl, fica a data da publicação, que é correta */ }
  }

  function estado(aberto) {
    cabecalho.toggleAttribute('data-menu-aberto', aberto);
    botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    botao.querySelector('.nav-toggle-texto').textContent = aberto ? 'Fechar' : 'Menu';
  }

  botao.addEventListener('click', function () {
    estado(botao.getAttribute('aria-expanded') !== 'true');
  });

  // Tocar num link fecha o menu. Sem isto, quem clica num destino da própria
  // página (#apostilas) rola por baixo do menu aberto e acha que nada aconteceu.
  menu.addEventListener('click', function (evento) {
    if (evento.target.closest('a')) estado(false);
  });

  // Esc fecha e devolve o foco ao botão, senão o teclado fica solto no vazio.
  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape' && botao.getAttribute('aria-expanded') === 'true') {
      estado(false);
      botao.focus();
    }
  });

  // Tocar fora fecha. O menu cobre a leitura; sair dele tem de ser tão fácil
  // quanto entrar, sem obrigar a mira no mesmo botão.
  document.addEventListener('click', function (evento) {
    if (!cabecalho.contains(evento.target) && botao.getAttribute('aria-expanded') === 'true') estado(false);
  });

  // Ao voltar para a largura de computador o menu volta a ser uma barra sozinho,
  // pelo CSS. O atributo precisa sair junto para o botão não reabrir invertido.
  var largo = window.matchMedia('(min-width:901px)');
  var aoMudar = function (evento) { if (evento.matches) estado(false); };
  if (largo.addEventListener) largo.addEventListener('change', aoMudar);
  else if (largo.addListener) largo.addListener(aoMudar);
})();
