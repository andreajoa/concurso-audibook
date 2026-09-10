const state = { materials: [], filter: 'all', search: '', current: null, tab: 'read' };
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const escapeHtml = (value='') => value.replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

async function init(){
  const res = await fetch('/materials.json', { cache:'no-store' });
  state.materials = await res.json();
  renderMaterials();
  wireEvents();
  revealOnScroll();
  restoreFromUrl();
}

function renderMaterials(){
  const grid = $('#material-grid');
  const q = state.search.trim().toLowerCase();
  const visible = state.materials.filter(m => {
    const filterOk = state.filter === 'all' || m.tags.includes(state.filter);
    const haystack = [m.title,m.subtitle,m.audience,m.description,...m.tags].join(' ').toLowerCase();
    return filterOk && (!q || haystack.includes(q));
  });
  grid.innerHTML = visible.map(cardTemplate).join('');
  $('#empty-state').hidden = visible.length > 0;
}

function cardTemplate(m){
  const tags = m.tags.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('');
  const highlights = m.highlights.map(t=>`<span class="highlight">${escapeHtml(t)}</span>`).join('');
  return `<article class="material-card reveal is-visible ${m.featured?'featured':''}" data-material-id="${escapeHtml(m.id)}">
    <div class="material-cover"><img src="${escapeHtml(m.cover)}" alt="Capa de ${escapeHtml(m.title)}" loading="lazy"></div>
    <div class="material-content">
      <span class="material-type">${escapeHtml(m.type)} • ${escapeHtml(m.edition)}</span>
      <h3>${escapeHtml(m.title)}</h3>
      <div class="material-subtitle">${escapeHtml(m.subtitle)}</div>
      <div class="material-audience">${escapeHtml(m.audience)}</div>
      <p class="material-description">${escapeHtml(m.description)}</p>
      <div class="tag-row">${tags}</div>
      <div class="highlight-row" style="margin-top:8px">${highlights}</div>
      <div class="material-actions">
        <button class="action-main" type="button" data-open-material="${escapeHtml(m.id)}" data-view="read">▤ Ler online</button>
        <button class="action-secondary" type="button" data-open-material="${escapeHtml(m.id)}" data-view="audio">▶ Ouvir audiobook</button>
        <button class="action-link" type="button" data-open-material="${escapeHtml(m.id)}" data-view="download">↓ Baixar materiais</button>
      </div>
    </div>
  </article>`;
}

function wireEvents(){
  $('#material-search').addEventListener('input', e => { state.search=e.target.value; renderMaterials(); });
  $$('.filter-pill').forEach(btn => btn.addEventListener('click', () => {
    $$('.filter-pill').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    state.filter=btn.dataset.filter; renderMaterials();
  }));
  document.addEventListener('click', e => {
    const opener = e.target.closest('[data-open-material]');
    if(opener) openMaterial(opener.dataset.openMaterial, opener.dataset.view || 'read');
    const featured = e.target.closest('[data-open-featured]');
    if(featured && state.materials[0]) openMaterial(state.materials[0].id, featured.dataset.openFeatured);
    if(e.target.closest('[data-close-modal]')) closeModal();
    const tab = e.target.closest('[data-tab]'); if(tab) switchTab(tab.dataset.tab);
    const mobileTab = e.target.closest('[data-mobile-action]'); if(mobileTab) switchTab(mobileTab.dataset.mobileAction);
    const speed = e.target.closest('[data-speed]'); if(speed) setSpeed(Number(speed.dataset.speed));
  });
  document.addEventListener('keydown', e => { if(e.key==='Escape' && !$('#study-modal').hidden) closeModal(); });
  $('#audio-player').addEventListener('timeupdate', saveAudioProgress);
  $('#audio-player').addEventListener('loadedmetadata', restoreAudioProgress);
}

function openMaterial(id, view='read'){
  const m = state.materials.find(x=>x.id===id); if(!m) return;
  state.current=m;
  $('#modal-kicker').textContent = `${m.type} • ${m.edition}`;
  $('#modal-title').textContent=m.title;
  $('#modal-subtitle').textContent=m.subtitle;
  $('#pdf-frame').src=`${m.pdf}#view=FitH&toolbar=1&navpanes=0`;
  $('#open-pdf-new').href=m.pdf;
  $('#audio-cover').src=m.cover;
  $('#audio-title').textContent=m.audioTitle;
  $('#audio-player').src=m.audio;
  $('#download-pdf').href=m.pdf; $('#download-pdf').setAttribute('download',m.pdfDownloadName);
  $('#download-audio').href=m.audio; $('#download-audio').setAttribute('download',m.audioDownloadName);
  const modal=$('#study-modal'); modal.hidden=false; modal.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden';
  switchTab(view); updateUrl(id, view); setTimeout(()=>$('.icon-button').focus(),30);
}

function closeModal(){
  const modal=$('#study-modal');
  $('#audio-player').pause(); modal.hidden=true; modal.setAttribute('aria-hidden','true'); document.body.style.overflow='';
  history.replaceState({},'',location.pathname+location.hash);
}

function switchTab(name){
  state.tab=name;
  $$('.tab-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));
  $$('[data-tab]').forEach(b=>{const on=b.dataset.tab===name;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});
  $$('[data-mobile-action]').forEach(b=>b.classList.toggle('active',b.dataset.mobileAction===name));
  if(state.current) updateUrl(state.current.id,name);
}

function setSpeed(speed){
  const audio=$('#audio-player'); audio.playbackRate=speed;
  $$('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===speed));
}
function progressKey(){return state.current?`study-progress:${state.current.id}`:null}
function saveAudioProgress(){const a=$('#audio-player'),key=progressKey();if(key && a.currentTime>3)localStorage.setItem(key,String(a.currentTime));}
function restoreAudioProgress(){const a=$('#audio-player'),key=progressKey(),saved=key?Number(localStorage.getItem(key)||0):0;if(saved>5 && saved<a.duration-8){a.currentTime=saved;$('#resume-note').textContent=`Continuando de ${formatTime(saved)}.`}else{$('#resume-note').textContent='';}}
function formatTime(s){const m=Math.floor(s/60),sec=Math.floor(s%60).toString().padStart(2,'0');return `${m}:${sec}`}
function updateUrl(id,view){const url=new URL(location.href);url.searchParams.set('material',id);url.searchParams.set('view',view);history.replaceState({},'',url);}
function restoreFromUrl(){const p=new URLSearchParams(location.search),id=p.get('material'),view=p.get('view');if(id)openMaterial(id,view||'read');}
function revealOnScroll(){
  const nodes=$$('.reveal:not(.is-visible)');
  if(!('IntersectionObserver'in window)){nodes.forEach(n=>n.classList.add('is-visible'));return;}
  const io=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){const delay=Number(entry.target.dataset.delay||0);setTimeout(()=>entry.target.classList.add('is-visible'),delay);io.unobserve(entry.target);}}),{threshold:.12,rootMargin:'0px 0px -30px'});
  nodes.forEach(n=>io.observe(n));
}
init().catch(err=>{console.error(err);$('#material-grid').innerHTML='<div class="empty-state">Não foi possível carregar a biblioteca. Atualize a página e tente novamente.</div>';});
