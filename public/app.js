const state = {
  materials: [],
  filter: 'all',
  search: '',
  current: null,
  tab: 'read',
  tracks: [],
  trackIndex: 0,
  playbackRate: 1
};
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const escapeHtml = (value='') => String(value).replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

async function init(){
  const res = await fetch('/materials.json', { cache:'no-store' });
  if(!res.ok) throw new Error(`materials.json: ${res.status}`);
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
    const chapterText = Array.isArray(m.chapters) ? m.chapters.map(c => `${c.title} ${c.subtitle || ''}`).join(' ') : '';
    const haystack = [m.title,m.subtitle,m.audience,m.description,...m.tags,chapterText].join(' ').toLowerCase();
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

    const tab = e.target.closest('[data-tab]');
    if(tab) switchTab(tab.dataset.tab);

    const mobileTab = e.target.closest('[data-mobile-action]');
    if(mobileTab) switchTab(mobileTab.dataset.mobileAction);

    const speed = e.target.closest('[data-speed]');
    if(speed) setSpeed(Number(speed.dataset.speed));

    const track = e.target.closest('[data-track-index]');
    if(track) playTrack(Number(track.dataset.trackIndex), true);

    if(e.target.closest('[data-prev-track]')) playTrack(state.trackIndex - 1, true);
    if(e.target.closest('[data-next-track]')) playTrack(state.trackIndex + 1, true);
  });

  document.addEventListener('keydown', e => {
    if(e.key==='Escape' && !$('#study-modal').hidden) closeModal();
  });

  const audio = $('#audio-player');
  audio.addEventListener('timeupdate', saveAudioProgress);
  audio.addEventListener('loadedmetadata', restoreAudioProgress);
  audio.addEventListener('ended', () => {
    if(state.trackIndex < state.tracks.length - 1) playTrack(state.trackIndex + 1, true);
  });
  audio.addEventListener('error', () => {
    if(!audio.currentSrc) return;
    $('#resume-note').textContent = 'Não foi possível carregar esta faixa agora. Tente novamente em instantes.';
  });
}

function buildTracks(m){
  const summary = {
    id: 'summary',
    title: m.audioTitle || 'Resumo da Apostila',
    subtitle: m.audioSubtitle || 'Revisão complementar',
    url: m.audio,
    downloadName: m.audioDownloadName || 'resumo-apostila.mp3',
    kind: 'Resumo'
  };
  const chapters = (Array.isArray(m.chapters) ? m.chapters : []).map((chapter, index) => ({
    ...chapter,
    kind: `Capítulo ${index + 1}`,
    downloadName: chapter.downloadName || `capitulo-${String(index + 1).padStart(2,'0')}.mp3`
  }));
  return [summary, ...chapters].filter(track => track.url);
}

function renderAudioChapters(m){
  const info = $('.audio-info');
  if(!info) return;
  let host = $('#audio-chapters');
  if(!host){
    host = document.createElement('div');
    host.id = 'audio-chapters';
    info.insertBefore(host, $('#audio-player'));
  }

  const tracks = state.tracks;
  host.innerHTML = `<div style="margin:18px 0 16px;padding:14px;border:1px solid rgba(12,39,72,.13);border-radius:16px;background:rgba(255,255,255,.45)">
    <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap">
      <div style="font-size:10px;letter-spacing:.14em;font-weight:800;color:#a84b2b">AUDIOBOOK COMPLETO • ${Math.max(0,tracks.length-1)} CAPÍTULOS + RESUMO</div>
      <div id="track-counter" style="font-size:10px;font-weight:800;color:#0c2748"></div>
    </div>
    <div style="display:grid;gap:7px;max-height:330px;overflow:auto;padding-right:2px">
      ${tracks.map((track,index)=>`<div data-track-row="${index}" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center">
        <button type="button" data-track-index="${index}" aria-current="${index===0?'true':'false'}" style="width:100%;display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;text-align:left;padding:10px 11px;border:1px solid ${index===0?'#a84b2b':'rgba(12,39,72,.11)'};border-radius:12px;background:${index===0?'rgba(168,75,43,.07)':'#fffdf9'};color:#0b1f36;cursor:pointer">
          <span style="font-family:Georgia,serif;color:#a84b2b">${index===0?'R':String(index).padStart(2,'0')}</span>
          <span><b style="display:block;font-size:11px">${escapeHtml(track.title)}</b><small style="display:block;color:#66717e;font-size:9px;margin-top:2px">${escapeHtml(track.subtitle || '')}</small></span>
          <span data-track-state style="font-size:9px;font-weight:800;color:#0c2748">${index===0?'TOCANDO':'OUVIR'}</span>
        </button>
        <a href="${escapeHtml(track.url)}" download="${escapeHtml(track.downloadName || '')}" title="Baixar ${escapeHtml(track.title)}" aria-label="Baixar ${escapeHtml(track.title)}" style="display:grid;place-items:center;width:36px;height:36px;border:1px solid rgba(12,39,72,.11);border-radius:10px;text-decoration:none;color:#0c2748;background:#fffdf9;font-weight:800">↓</a>
      </div>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-top:11px">
      <button type="button" data-prev-track style="flex:1;padding:9px 10px;border:1px solid rgba(12,39,72,.15);border-radius:10px;background:#fffdf9;color:#0c2748;font-weight:800;cursor:pointer">← Anterior</button>
      <button type="button" data-next-track style="flex:1;padding:9px 10px;border:1px solid rgba(12,39,72,.15);border-radius:10px;background:#fffdf9;color:#0c2748;font-weight:800;cursor:pointer">Próximo →</button>
    </div>
    <p style="font-size:10px;color:#66717e;margin:10px 2px 0">Todas as faixas tocam diretamente nesta página. O ponto de cada faixa fica salvo neste navegador.</p>
  </div>`;
  updateTrackUI();
}

function updateTrackUI(){
  const current = state.tracks[state.trackIndex];
  if(!current) return;
  $$('[data-track-row]').forEach((row,index) => {
    const button = $('[data-track-index]', row);
    const status = $('[data-track-state]', row);
    const active = index === state.trackIndex;
    if(button){
      button.setAttribute('aria-current', active ? 'true' : 'false');
      button.style.borderColor = active ? '#a84b2b' : 'rgba(12,39,72,.11)';
      button.style.background = active ? 'rgba(168,75,43,.07)' : '#fffdf9';
    }
    if(status) status.textContent = active ? 'TOCANDO' : 'OUVIR';
  });

  const counter = $('#track-counter');
  if(counter) counter.textContent = `${state.trackIndex + 1} / ${state.tracks.length}`;

  const prev = $('[data-prev-track]');
  const next = $('[data-next-track]');
  if(prev){ prev.disabled = state.trackIndex === 0; prev.style.opacity = prev.disabled ? '.45' : '1'; }
  if(next){ next.disabled = state.trackIndex >= state.tracks.length - 1; next.style.opacity = next.disabled ? '.45' : '1'; }

  $('#audio-title').textContent = current.title;
  const download = $('#download-audio');
  download.href = current.url;
  download.setAttribute('download', current.downloadName || 'audiobook.mp3');
}

function playTrack(index, autoplay=false){
  if(index < 0 || index >= state.tracks.length) return;
  const audio = $('#audio-player');
  if(!audio) return;

  saveAudioProgress();
  audio.pause();
  state.trackIndex = index;
  const track = state.tracks[index];
  audio.src = track.url;
  audio.playbackRate = state.playbackRate;
  audio.load();
  $('#resume-note').textContent = '';
  updateTrackUI();

  if(autoplay){
    audio.play().catch(() => {
      $('#resume-note').textContent = 'Faixa carregada. Toque em reproduzir para iniciar.';
    });
  }
}

function openMaterial(id, view='read'){
  const m = state.materials.find(x=>x.id===id); if(!m) return;
  state.current=m;
  state.tracks=buildTracks(m);
  state.trackIndex=0;

  $('#modal-kicker').textContent = `${m.type} • ${m.edition}`;
  $('#modal-title').textContent=m.title;
  $('#modal-subtitle').textContent=m.subtitle;
  $('#pdf-frame').src=`${m.pdf}#view=FitH&toolbar=1&navpanes=0`;
  $('#open-pdf-new').href=m.pdf;
  $('#audio-cover').src=m.cover;
  renderAudioChapters(m);
  playTrack(0, false);

  $('#download-pdf').href=m.pdf;
  $('#download-pdf').setAttribute('download',m.pdfDownloadName);

  const modal=$('#study-modal');
  modal.hidden=false;
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  switchTab(view);
  updateUrl(id, view);
  setTimeout(()=>$('.icon-button').focus(),30);
}

function closeModal(){
  const modal=$('#study-modal');
  saveAudioProgress();
  $('#audio-player').pause();
  modal.hidden=true;
  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
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
  state.playbackRate=speed;
  const audio=$('#audio-player');
  audio.playbackRate=speed;
  $$('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===speed));
}

function currentTrack(){ return state.tracks[state.trackIndex] || null; }
function progressKey(){
  const track=currentTrack();
  return state.current && track ? `study-progress:${state.current.id}:${track.id}` : null;
}
function saveAudioProgress(){
  const a=$('#audio-player'), key=progressKey();
  if(key && Number.isFinite(a.currentTime) && a.currentTime>3) localStorage.setItem(key,String(a.currentTime));
}
function restoreAudioProgress(){
  const a=$('#audio-player'), key=progressKey(), saved=key?Number(localStorage.getItem(key)||0):0;
  a.playbackRate=state.playbackRate;
  if(saved>5 && Number.isFinite(a.duration) && saved<a.duration-8){
    a.currentTime=saved;
    $('#resume-note').textContent=`Continuando de ${formatTime(saved)}.`;
  }else{
    $('#resume-note').textContent='';
  }
}
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
