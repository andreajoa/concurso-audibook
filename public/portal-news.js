(() => {
  'use strict';

  const ASSET = '/assets/portal/';
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const q = (selector, root = document) => root.querySelector(selector);
  const esc = (value = '') => String(value).replace(/[&<>\"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));

  function ptDate() {
    try {
      const text = new Intl.DateTimeFormat('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      }).format(new Date());
      return text.charAt(0).toUpperCase() + text.slice(1);
    } catch {
      return 'Portal atualizado';
    }
  }

  function portalHeader() {
    const old = q('.guide-header');
    if (!old || q('.portal-site-header')) return;

    const shell = document.createElement('div');
    shell.className = 'portal-site-header';
    shell.innerHTML = `
      <div class="portal-utility">
        <div class="portal-wide">
          <span>${esc(ptDate())}</span>
          <span class="portal-utility-motto">Seu guia diário para conquistar a aprovação</span>
          <nav aria-label="Links institucionais">
            <a href="/sobre">Sobre</a><a href="/contato">Contato</a>
            <a href="https://www.instagram.com/trilhaaprova.concursos/" target="_blank" rel="noopener">Instagram</a>
          </nav>
        </div>
      </div>
      <div class="portal-masthead">
        <div class="portal-wide portal-masthead-grid">
          <a class="portal-brand" href="/" aria-label="Trilha Aprova — início">
            <img src="/assets/trilha-aprova-logo.webp?v=20260912" alt="Trilha Aprova" width="180" height="84">
          </a>
          <form class="portal-search" role="search" aria-label="Buscar no portal">
            <input type="search" name="q" placeholder="Busque por concurso, órgão, cargo ou assunto..." aria-label="Buscar no portal">
            <button type="submit" aria-label="Buscar">⌕</button>
          </form>
          <a class="portal-login" href="/recuperar"><span aria-hidden="true">♙</span><strong>Entrar</strong><small>Minha conta</small></a>
          <a class="portal-approve" href="/apostilas-para-concurso">Quero ser aprovado <span>→</span></a>
        </div>
      </div>
      <nav class="portal-primary" aria-label="Navegação principal">
        <div class="portal-wide">
          <a class="portal-home-link" href="/" aria-label="Início">⌂</a>
          <a href="/concursos">Concursos Abertos</a><a href="/materias">Notícias</a>
          <a href="/materias/como-ler-um-edital-de-concurso-sem-perder-nada-importante">Editais</a>
          <a href="/concursos">Salários</a><a href="/materias">Matérias</a><a href="/ferramentas">Ferramentas</a>
          <a href="/apostilas-para-concurso">Apostilas</a><a href="/como-estudar-para-concurso-do-zero">Guias de Estudo</a>
          <a class="portal-more" href="/sobre">☰&nbsp; Mais</a>
        </div>
      </nav>
      <div class="portal-breaking">
        <div class="portal-wide">
          <strong>⚡ &nbsp;ÚLTIMAS NOTÍCIAS</strong>
          <div class="portal-breaking-track"><span>Guarulhos reúne 5 concursos acompanhados pelo portal</span><i>•</i><span>724 vagas somadas nos certames com inscrição aberta</span><i>•</i><span>Santos tem provas previstas para setembro e outubro</span></div>
          <a href="/materias">Ver todas →</a>
        </div>
      </div>`;

    old.replaceWith(shell);
    const form = q('.portal-search', shell);
    form?.addEventListener('submit', event => {
      event.preventDefault();
      const value = String(new FormData(form).get('q') || '').trim().toLowerCase();
      const routes = [
        [/santos/, '/concursos/sp/santos'], [/guarulhos/, '/concursos/sp/guarulhos'], [/catanduva/, '/concursos/sp/catanduva'],
        [/apostila|material|audio/, '/apostilas-para-concurso'], [/ferramenta|cronograma|simulado|quest/, '/ferramentas'],
        [/edital/, '/materias/como-ler-um-edital-de-concurso-sem-perder-nada-importante'], [/estudar|estudo|guia/, '/como-estudar-para-concurso-do-zero']
      ];
      const hit = routes.find(([regex]) => regex.test(value));
      location.href = hit ? hit[1] : '/concursos';
    });
  }

  function newsCard(tag, title, desc, image, href, date) {
    return `<article class="portal-news-card"><a class="portal-news-image" href="${href}" style="background-image:url('${ASSET}${image}')"><span>${tag}</span></a><a class="portal-news-copy" href="${href}"><h3>${title}</h3><p>${desc}</p><small>${date} &nbsp;•&nbsp; 3 min de leitura</small></a></article>`;
  }

  const topic = (icon, label, href) => `<a href="${href}"><span>${icon}</span><b>${label}</b></a>`;
  const mini = (icon, label, href) => `<a href="${href}"><span>${icon}</span><b>${label}</b></a>`;
  const material = (img, title, sub, href) => `<a href="${href}"><img src="${img}" alt="" loading="lazy"><span><b>${title}</b><small>${sub}</small></span></a>`;

  function homeHTML() {
    return `<main class="portal-home" id="conteudo-principal">
      <section class="portal-lead-layout portal-wide" aria-label="Destaques">
        <a class="portal-lead" href="/concursos" style="--lead:url('${ASSET}portal-hero-concursos.webp')">
          <div class="portal-lead-copy"><span class="portal-chip">CONCURSOS EM DESTAQUE</span><h1>Concursos em São Paulo: 724 vagas com inscrição aberta agora</h1><p>Veja cidades, bancas, cargos e prazos em fichas conferidas a partir das páginas oficiais dos órgãos.</p><span class="portal-button">Ver todos os concursos &nbsp;→</span></div>
          <div class="portal-lead-stats"><span><b>724</b> vagas somadas</span><span><b>14</b> certames abertos</span><span><b>9</b> cidades</span><span><b>SP</b> mapa atual</span></div>
        </a>
        <aside class="portal-side-stack">
          <section class="portal-side-card"><header><h2>◆ &nbsp;RADAR DE INSCRIÇÕES</h2><a href="/concursos">Ver todas →</a></header>
            <a href="/concursos/sp/guarulhos"><span><b>Guarulhos</b><small>5 certames acompanhados</small></span><em>17/09</em></a>
            <a href="/concursos/sp/catanduva"><span><b>Catanduva</b><small>2 seleções mapeadas</small></span><em>Ver ficha</em></a>
            <a href="/concursos/sp/maua"><span><b>Mauá</b><small>1 concurso mapeado</small></span><em>Ver ficha</em></a>
            <a href="/concursos/sp/limeira"><span><b>Limeira</b><small>1 concurso mapeado</small></span><em>Ver ficha</em></a>
            <a href="/concursos/sp/sao-paulo"><span><b>São Paulo</b><small>1 certame mapeado</small></span><em>Ver ficha</em></a>
          </section>
          <section class="portal-side-card portal-deadlines"><header><h2>▣ &nbsp;PRAZOS DA SEMANA</h2><a href="/concursos">Ver calendário →</a></header>
            <a href="/concursos/sp/guarulhos"><time>17<br><small>SET</small></time><span><b>Guarulhos</b><small>4 certames encerram inscrições</small></span></a>
            <a href="/concursos/sp/santos"><time>27<br><small>SET</small></time><span><b>Santos</b><small>Prova prevista — Edital 71/2026</small></span></a>
            <a href="/concursos/sp/santos"><time>11<br><small>OUT</small></time><span><b>Santos</b><small>Provas previstas — Editais 70 e 73</small></span></a>
          </section>
        </aside>
      </section>

      <section class="portal-news-layout portal-wide">
        <div class="portal-news-main"><div class="portal-section-head"><h2>ÚLTIMAS NOTÍCIAS</h2><a href="/materias">Ver todas as notícias →</a></div>
          <div class="portal-news-grid">
            ${newsCard('CONCURSOS','Guarulhos concentra cinco concursos acompanhados pelo portal','Acesse as fichas, veja os cargos e confirme cada informação na fonte oficial.','portal-strip-alertas.webp','/concursos/sp/guarulhos','14 set 2026')}
            ${newsCard('EDITAIS','Como ler um edital sem perder o que realmente importa','Requisitos, conteúdo programático, pesos, desempate e retificações em uma leitura prática.','portal-strip-edital.webp','/materias/como-ler-um-edital-de-concurso-sem-perder-nada-importante','13 set 2026')}
            ${newsCard('SALÁRIOS','Santos tem vagas de nível médio com vencimento-base acima de R$ 3,7 mil','Veja as fichas dos editais acompanhados e confira requisitos, banca e fases.','portal-hero-prazos.webp','/concursos/sp/santos','14 set 2026')}
            ${newsCard('MATÉRIAS','Como montar um plano de estudos sem criar uma rotina impossível','Transforme o conteúdo do edital em blocos de estudo, revisão e questões.','portal-top-como-estudar.webp','/como-estudar-para-concurso-do-zero','14 set 2026')}
            ${newsCard('PROVAS','Sua meta de acertos cabe numa conta simples','Use a calculadora gratuita para descobrir quantas questões faltam para chegar ao objetivo.','portal-strip-simulados.webp','/ferramentas/calculadora-de-acertos','14 set 2026')}
            ${newsCard('CONCURSOS','O mapa de concursos começa por estado e município','Escolha a cidade e consulte banca, inscrição, prova e fonte oficial em uma única ficha.','portal-square-concursos.webp','/concursos','14 set 2026')}
          </div>
        </div>
        <aside class="portal-news-aside"><section class="portal-newsletter-card"><span>✉</span><h2>RECEBA ALERTAS DE CONCURSOS</h2><p>Seja avisado sobre novas apostilas, conteúdos e atualizações do portal.</p><button type="button" data-newsletter-open>Quero receber</button><small>Sem spam. Cancele quando quiser.</small></section></aside>
      </section>

      <section class="portal-topics portal-wide"><div class="portal-section-head"><h2>NAVEGUE POR ASSUNTOS</h2></div><div class="portal-topic-grid">
        ${topic('⌖','Concursos Abertos','/concursos')}${topic('▤','Editais','/materias/como-ler-um-edital-de-concurso-sem-perder-nada-importante')}${topic('◉','Salários','/concursos')}${topic('▣','Provas','/concursos')}${topic('▥','Matérias','/materias')}${topic('⌘','Ferramentas','/ferramentas')}${topic('▱','Apostilas','/apostilas-para-concurso')}${topic('◇','Guias de Estudo','/como-estudar-para-concurso-do-zero')}
      </div></section>

      <section class="portal-service-grid portal-wide">
        <section class="portal-service-card"><header><div><b>◆ &nbsp;FERRAMENTAS GRATUITAS</b><small>Recursos para organizar seus estudos e aumentar sua produtividade.</small></div><a href="/ferramentas">Ver todas →</a></header><div class="portal-mini-grid">${mini('▣','Cronograma de estudos','/ferramentas/cronograma-de-estudos')}${mini('☑','Caderno de erros','/ferramentas/caderno-de-erros')}${mini('▤','Simulados e meta','/ferramentas/calculadora-de-acertos')}${mini('◎','Trilha do dia','/ferramentas/trilha-do-dia')}</div></section>
        <section class="portal-service-card"><header><div><b>▥ &nbsp;MATERIAIS EM DESTAQUE</b><small>Apostilas em PDF e audiobook para revisão direcionada.</small></div><a href="/apostilas-para-concurso">Ver todos →</a></header><div class="portal-material-list">${material('/assets/apostila-autores-cover.svg','Guia de Autores — IBAM','Santos 2026','/apostilas/autores-ibam-2026')}${material('/assets/apostila-agente-de-portaria-3d.webp','Agente de Portaria','Santos 2026','/apostilas/agente-de-portaria-ibam-santos-2026')}${material('/assets/apostila-inspetor-de-alunos-3d.webp','Inspetor de Alunos','Santos 2026','/apostilas/inspetor-de-alunos-ibam-santos-2026')}</div></section>
        <section class="portal-service-card"><header><div><b>◇ &nbsp;GUIAS DE ESTUDO</b><small>Passo a passo para estudar com mais direção e resultado.</small></div><a href="/como-estudar-para-concurso-do-zero">Ver todos →</a></header><div class="portal-guide-list"><a href="/materias/como-ler-um-edital-de-concurso-sem-perder-nada-importante">Como ler um edital e não perder nada importante <span>→</span></a><a href="/como-estudar-para-concurso-do-zero">Do zero à preparação: guia prático <span>→</span></a><a href="/como-estudar-com-apostila-e-audiobook">Como combinar leitura e audiobook <span>→</span></a><a href="/glossario-concursos-publicos">Glossário de concursos públicos <span>→</span></a></div></section>
      </section>

      <section class="portal-cta" style="--cta:url('${ASSET}portal-strip-alertas.webp')"><div class="portal-wide"><h2>Disciplina hoje.<br>Aprovação amanhã.</h2><p>Conteúdo confiável, ferramentas práticas e apoio para cada etapa da sua jornada.</p><a href="/concursos">Comece sua trilha &nbsp;→</a></div></section>
    </main>`;
  }

  function renderHome() {
    if (path !== '/') return;
    const main = q('main');
    if (!main) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = homeHTML();
    main.replaceWith(wrap.firstElementChild);
    document.title = 'Concursos públicos, editais e estudo | Trilha Aprova';
    document.body.classList.add('portal-home-page');
  }

  function routeHero() {
    if (path === '/') return null;
    const rules = [
      [/^\/concursos\/sp\/santos|^\/concursos-publicos-santos/, ['CONCURSOS EM SANTOS','portal-hero-concursos.webp']],
      [/^\/concursos\/sp\/guarulhos/, ['CONCURSOS EM GUARULHOS','portal-strip-alertas.webp']],
      [/^\/concursos\/sp\/catanduva/, ['CONCURSOS EM CATANDUVA','portal-hero-prazos.webp']],
      [/^\/concursos\/?$|^\/concursos\/sp\/?$/, ['CONCURSOS ABERTOS','portal-hero-concursos.webp']],
      [/^\/concursos\//, ['DETALHES DO CONCURSO','portal-square-concursos.webp']],
      [/^\/materias\/?$/, ['NOTÍCIAS E MATÉRIAS','portal-top-materias.webp']],
      [/^\/materias\//, ['ARTIGO EM DESTAQUE','portal-strip-edital.webp']],
      [/^\/ferramentas/, ['FERRAMENTAS GRATUITAS','portal-hero-ferramentas.webp']],
      [/^\/apostilas-para-concurso/, ['APOSTILAS','portal-hero-apostilas.webp']],
      [/^\/como-estudar|^\/glossario|^\/concursos-baixada-santista/, ['GUIAS DE ESTUDO','portal-top-como-estudar.webp']],
      [/^\/sobre/, ['SOBRE A TRILHA APROVA','portal-top-glossario.webp']],
      [/^\/contato/, ['ATENDIMENTO','portal-top-duvidas.webp']],
      [/^\/perguntas-frequentes/, ['DÚVIDAS FREQUENTES','portal-top-duvidas.webp']],
      [/^\/recuperar|^\/entrega-e-acesso/, ['ACESSO E SUPORTE','portal-hero-ferramentas.webp']]
    ];
    for (const [regex, value] of rules) if (regex.test(path)) return value;
    return null;
  }

  function renderInnerHero() {
    const data = routeHero();
    if (!data || q('.portal-inner-hero')) return;
    const main = q('main');
    if (!main) return;
    const h1 = q('h1', main);
    const answer = q('.answer', main) || (h1 ? h1.nextElementSibling : null);
    const title = h1?.textContent?.trim() || document.title.split('|')[0].trim();
    const desc = answer?.tagName === 'P' ? answer.textContent.trim() : 'Informação organizada para você acompanhar oportunidades e estudar com direção.';
    const hero = document.createElement('section');
    hero.className = 'portal-inner-hero';
    hero.style.setProperty('--inner-image', `url('${ASSET}${data[1]}')`);
    hero.innerHTML = `<div class="portal-wide"><div class="portal-inner-copy"><span>${data[0]}</span><h1>${esc(title)}</h1><p>${esc(desc)}</p></div></div>`;
    q('.portal-site-header')?.insertAdjacentElement('afterend', hero);
    if (h1) h1.classList.add('portal-source-hidden');
    if (answer?.tagName === 'P') answer.classList.add('portal-source-hidden');
    q('.eyebrow', main)?.classList.add('portal-source-hidden');
    main.classList.add('portal-content-surface');
    document.body.classList.add('portal-inner-page');
  }

  function enhanceFooter() { q('.site-footer')?.classList.add('portal-footer'); }

  function init() {
    document.body.classList.add('portal-news-ui');
    portalHeader();
    renderHome();
    renderInnerHero();
    enhanceFooter();
    document.documentElement.classList.add('portal-ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
