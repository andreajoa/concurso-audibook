(()=>{
  const buttons=[document.getElementById('buy-button'),document.getElementById('buy-button-bottom')].filter(Boolean);
  const params=new URLSearchParams(location.search);
  const slug=params.get('produto')||'autores-ibam-2026';
  let leadSubmitted=false;

  function ensureAnalytics(){if(document.querySelector('script[src="/analytics-crm.js"]'))return;const s=document.createElement('script');s.src='/analytics-crm.js';s.defer=true;document.head.appendChild(s)}
  function identity(){return window.concursoCRM?.identity?.()||{}}
  function track(name,details={},beacon=false){window.concursoCRM?.track?.(name,details,beacon)}

  function addWhatsApp(){
    const a=document.createElement('a');
    a.href='https://api.whatsapp.com/send/?phone=5513978141244&text=Oi%20Margareth%21%20Vim%20pelo%20seu%20perfil%20%E2%9D%A4%EF%B8%8F&type=phone_number&app_absent=0';
    a.target='_blank';a.rel='noopener';a.dataset.crmEvent='whatsapp_click';a.textContent='WhatsApp';a.setAttribute('aria-label','Falar com Margareth pelo WhatsApp');
    a.style.cssText='position:fixed;right:18px;bottom:18px;z-index:80;background:#167d4c;color:#fff;text-decoration:none;padding:13px 16px;border-radius:999px;font-weight:800;box-shadow:0 12px 32px rgba(0,0,0,.2)';
    document.body.appendChild(a);
  }

  function getModal(){
    let m=document.getElementById('lead-modal');
    if(m)return m;
    m=document.createElement('div');m.id='lead-modal';m.hidden=true;m.style.cssText='position:fixed;inset:0;z-index:100;overflow:auto';
    m.innerHTML='<div data-close style="position:absolute;inset:0;background:rgba(7,25,48,.58)"></div><section style="position:relative;width:min(520px,calc(100% - 28px));margin:7vh auto;background:#fffdf9;border-radius:22px;padding:26px;box-shadow:0 30px 90px rgba(0,0,0,.25)"><button data-close type="button" aria-label="Fechar" style="position:absolute;right:14px;top:12px;border:0;background:transparent;font-size:25px">×</button><div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#a64b2a">ACESSO À APOSTILA + AUDIOBOOK</div><h2 style="font:400 30px Georgia,serif;margin:8px 0">Para onde enviamos seu acesso?</h2><p style="color:#66717e;line-height:1.5">Preencha seus dados antes de seguir para o pagamento seguro.</p><form id="lead-form" style="display:grid;gap:11px"><input name="name" autocomplete="name" required placeholder="Nome completo" style="padding:13px;border:1px solid #d9d0c6;border-radius:10px"><input name="email" type="email" autocomplete="email" required placeholder="Seu melhor e-mail" style="padding:13px;border:1px solid #d9d0c6;border-radius:10px"><input name="whatsapp" autocomplete="tel" required placeholder="WhatsApp com DDD" style="padding:13px;border:1px solid #d9d0c6;border-radius:10px"><label style="font-size:12px;color:#66717e;display:flex;gap:8px;align-items:flex-start"><input name="marketing" type="checkbox">Quero receber avisos sobre novas apostilas, revisões e oportunidades de estudo. Posso cancelar quando quiser.</label><button type="submit" style="border:0;background:#a64b2a;color:#fff;border-radius:11px;padding:14px;font-weight:800">Continuar para o pagamento</button><small style="color:#7a8490">Pagamento único de R$ 24,99. Seus dados de cartão são processados pela Stripe.</small></form><p id="lead-error" style="color:#a33131;font-size:12px"></p></section>';
    document.body.appendChild(m);
    m.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>{m.hidden=true;if(leadSubmitted)track('checkout_abandoned',{product_slug:slug},true)});
    m.querySelector('#lead-form').onsubmit=submitLead;
    return m;
  }

  async function submitLead(event){
    event.preventDefault();
    const f=event.currentTarget,b=f.querySelector('button'),name=f.elements.name.value.trim(),email=f.elements.email.value.trim().toLowerCase(),whatsapp=f.elements.whatsapp.value.replace(/\D/g,''),marketing=f.elements.marketing.checked,a=identity();
    if(name.length<3||!email.includes('@')||whatsapp.length<10){document.getElementById('lead-error').textContent='Confira nome, e-mail e WhatsApp.';return}
    b.disabled=true;b.textContent='Preparando pagamento...';
    try{
      await fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,whatsapp,marketing_consent:marketing,product_slug:slug,visitor_id:a.visitorId||'',session_id:a.sessionId||''})});
      leadSubmitted=true;
      track('lead_submitted',{product_slug:slug,value_cents:2499});
      const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,name,email,whatsapp,marketingConsent:marketing,analytics:a})});
      const data=await response.json();
      if(!response.ok||!data.url)throw new Error(data.error||'Checkout indisponível');
      track('checkout_started',{product_slug:slug,value_cents:2499,stripe_session_id:data.sessionId||''},true);
      location.href=data.url;
    }catch(error){
      console.error(error);document.getElementById('lead-error').textContent='Não foi possível abrir o pagamento agora. Tente novamente.';b.disabled=false;b.textContent='Continuar para o pagamento';
    }
  }

  ensureAnalytics();addWhatsApp();
  buttons.forEach(button=>{button.dataset.crmEvent='add_to_cart';button.dataset.product=slug;button.dataset.valueCents='2499';button.onclick=()=>{getModal().hidden=false;track('add_to_cart',{product_slug:slug,value_cents:2499})}});
  if(params.get('cancelado')==='1')setTimeout(()=>track('checkout_abandoned',{product_slug:slug},true),500);
})();
