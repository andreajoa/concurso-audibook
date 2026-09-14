(()=>{
  const A='/assets/portal/';
  const M={
    concursos:['portal-hero-concursos.png','portal-square-concursos.png','/concursos'],
    prazos:['portal-hero-prazos.png','portal-square-prazos.png','/concursos'],
    ferramentas:['portal-hero-ferramentas.png','portal-square-ferramentas.png','/ferramentas'],
    apostilas:['portal-hero-apostilas.png','portal-square-apostilas.png','/apostilas-para-concurso']
  };
  const main=document.querySelector('main');
  if(!main||document.documentElement.dataset.portalMediaReady==='1')return;
  document.documentElement.dataset.portalMediaReady='1';
  const path=location.pathname||'/';
  const after=(ref,node)=>ref&&ref.parentNode&&ref.parentNode.insertBefore(node,ref.nextSibling);
  function picture(item,alt){
    const p=document.createElement('picture');
    const s=document.createElement('source');
    s.media='(max-width:700px)';s.srcset=A+item[1];p.appendChild(s);
    const img=document.createElement('img');
    img.src=A+item[0];img.alt=alt||'Trilha Aprova';img.loading='lazy';img.decoding='async';p.appendChild(img);
    return p;
  }
  function banner(item,cls){
    const wrap=document.createElement('div');wrap.className=cls||'portal-media-shell';
    const a=document.createElement('a');a.className='portal-media-link';a.href=item[2];a.appendChild(picture(item));wrap.appendChild(a);return wrap;
  }
  function strip(wide,mobile,href){return banner([wide,mobile,href],'portal-strip-wrap');}
  function home(){
    const band=document.querySelector('.promo-band');
    if(band){
      band.className='portal-home-showcase';band.textContent='';
      const rail=document.createElement('div');rail.className='portal-home-carousel';band.appendChild(rail);
      const dots=document.createElement('div');dots.className='portal-home-dots';band.appendChild(dots);
      const items=[M.concursos,M.prazos,M.ferramentas,M.apostilas],slides=[],buttons=[];let index=0;
      const show=n=>{index=n;slides.forEach((x,i)=>x.classList.toggle('is-active',i===n));buttons.forEach((x,i)=>x.classList.toggle('is-active',i===n));};
      items.forEach((item,i)=>{const a=document.createElement('a');a.className='portal-home-slide'+(i?'':' is-active');a.href=item[2];a.appendChild(picture(item));rail.appendChild(a);slides.push(a);const b=document.createElement('button');b.type='button';b.className='portal-home-dot'+(i?'':' is-active');b.setAttribute('aria-label','Destaque '+(i+1));b.addEventListener('click',()=>show(i));dots.appendChild(b);buttons.push(b);});
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)setInterval(()=>show((index+1)%items.length),6500);
    }
    const anchor=document.querySelector('.specimen-strip')||document.querySelector('.catalog-hero');
    if(anchor){const sec=document.createElement('section');sec.className='portal-square-showcase';const h=document.createElement('h2');h.textContent='Escolha seu próximo passo';sec.appendChild(h);const grid=document.createElement('div');grid.className='portal-square-grid';[M.concursos,M.prazos,M.ferramentas,M.apostilas].forEach(item=>{const a=document.createElement('a');a.className='portal-square-card';a.href=item[2];const img=document.createElement('img');img.src=A+item[1];img.alt='Trilha Aprova';img.loading='lazy';img.decoding='async';a.appendChild(img);grid.appendChild(a);});sec.appendChild(grid);after(anchor,sec);}
    const metodo=document.querySelector('#metodo')||document.querySelector('.evidence-section');if(metodo)after(metodo,strip('portal-strip-edital.png','portal-square-ferramentas.png','/ferramentas/edital-verticalizado'));
    const catalog=document.querySelector('.catalog-future');if(catalog)after(catalog,strip('portal-strip-materiais.png','portal-square-apostilas.png','/apostilas-para-concurso'));
  }
  if(path==='/'||path==='/index.html'){home();return;}
  let hero=M.prazos,mid=['portal-strip-edital.png','portal-square-ferramentas.png','/ferramentas/edital-verticalizado'];
  if(path.startsWith('/concursos')||path.includes('concursos-publicos')||path.includes('concursos-baixada')){hero=M.concursos;mid=['portal-strip-alertas.png','portal-square-prazos.png','/concursos'];}
  else if(path.startsWith('/ferramentas')){hero=M.ferramentas;mid=path.includes('edital-verticalizado')?['portal-strip-edital.png','portal-square-ferramentas.png','/ferramentas/edital-verticalizado']:['portal-strip-simulados.png','portal-square-ferramentas.png','/ferramentas/calculadora-de-acertos'];}
  else if(path.startsWith('/apostilas')||path.includes('apostila')){hero=M.apostilas;mid=['portal-strip-materiais.png','portal-square-apostilas.png','/apostilas-para-concurso'];}
  const h1=main.querySelector('h1');if(h1)after(h1,banner(hero));
  const h2=[...main.querySelectorAll('h2')];if(h2.length>1)after(h2[1],strip(...mid));
})();
