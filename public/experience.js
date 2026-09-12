(()=>{
  const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fill=document.querySelector('[data-scroll-fill]');
  let fillWords=[];
  if(fill){
    const text=fill.textContent.trim();
    fill.setAttribute('aria-label',text);
    fill.innerHTML=text.split(/\s+/).map((word,i)=>`<span${i>Math.max(0,text.split(/\s+/).length-5)?' class="is-accent"':''} aria-hidden="true">${word}</span>`).join(' ');
    fillWords=[...fill.querySelectorAll('span')];
  }

  const stack=[...document.querySelectorAll('[data-stack-card]')];
  let natural=[];
  function measureStack(){natural=stack.map(card=>card.getBoundingClientRect().top+scrollY)}
  measureStack();

  function updateScrollEffects(){
    const vh=innerHeight||800;
    if(fill&&fillWords.length&&!reduce){
      const r=fill.getBoundingClientRect();
      const p=clamp((vh*.78-r.top)/(Math.max(1,r.height+vh*.35)));
      const cursor=p*(fillWords.length+5)-2;
      fillWords.forEach((word,i)=>{
        const d=clamp((cursor-i)/3);
        word.style.color=word.classList.contains('is-accent')?`rgba(166,125,47,${(.2+d*.8).toFixed(3)})`:`rgba(8,40,79,${(.16+d*.84).toFixed(3)})`;
      });
    }
    if(stack.length&&!reduce&&innerWidth>640){
      stack.forEach((card,i)=>{
        const top=94+i*12;
        const step=card.offsetHeight+18;
        const stuck=clamp((scrollY+top-natural[i])/Math.max(1,step));
        card.style.setProperty('--stack-scale',(1-stuck*.07).toFixed(3));
        card.style.setProperty('--stack-dim',(1-stuck*.34).toFixed(3));
      });
    }
  }

  let queued=false;
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;updateScrollEffects()})}
  addEventListener('scroll',queue,{passive:true});
  addEventListener('resize',()=>{if(scrollY<200)measureStack();queue()},{passive:true});
  updateScrollEffects();

  document.querySelectorAll('.spotlight-card').forEach(card=>{
    card.addEventListener('pointermove',event=>{
      if(reduce||event.pointerType==='touch')return;
      const r=card.getBoundingClientRect();
      card.style.setProperty('--mx',`${event.clientX-r.left}px`);
      card.style.setProperty('--my',`${event.clientY-r.top}px`);
    });
  });

  const panels=[...document.querySelectorAll('[data-expand-panel]')];
  function openPanel(panel){panels.forEach(item=>item.classList.toggle('is-open',item===panel))}
  panels.forEach(panel=>{
    panel.addEventListener('click',()=>openPanel(panel));
    panel.addEventListener('mouseenter',()=>{if(innerWidth>640)openPanel(panel)});
    panel.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPanel(panel)}});
  });
})();
