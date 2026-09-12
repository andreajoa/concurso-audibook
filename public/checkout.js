(()=>{
  const buttons=[document.getElementById('buy-button'),document.getElementById('buy-button-bottom')].filter(Boolean);
  const params=new URLSearchParams(location.search);
  const slug=params.get('produto')||'autores-ibam-2026';
  let leadSubmitted=false,embeddedCheckout=null,stripeConfigPromise=null;

  function loadAnalytics(){if(document.querySelector('script[src="/analytics-crm.js"]'))return;const s=document.createElement('script');s.src='/analytics-crm.js';s.defer=true;document.head.appendChild(s)}
  function identity(){return window.concursoCRM?.identity?.()||{}}
  function loadStripeJs(){if(window.Stripe)return Promise.resolve();return new Promise((resolve,reject)=>{const old=document.querySelector('script[data-stripe-js]');if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',reject,{once:true});return}const s=document.createElement('script');s.src='https://js.stripe.com/v3/';s.async=true;s.dataset.stripeJs='1';s.onload=resolve;s.onerror=()=>reject(new Error('Stripe.js indisponível'));document.head.appendChild(s)})}
  function stripeConfig(){if(!stripeConfigPromise)stripeConfigPromise=fetch('/api/checkout',{cache:'no-store'}).then(r=>r.json()).catch(()=>({embedded:false,publishableKey:''}));return stripeConfigPromise}
  function injectWhats(){if(document.querySelector('[data-whatsapp-float]'))return;const a=document.createElement('a');a.href='https://api.whatsapp.com/send/?phone=5513978141244&text=Oi%20Margareth%21%20Vim%20pelo%20seu%20perfil%20%E2%9D%A4%EF%B8%8F&type=phone_number&app_absent=0';a.target='_blank';a.rel='noopener';a.dataset.whatsappFloat='1';a.dataset.crmEvent='whatsapp_click';a.setAttribute('aria-label','Suporte Trilha Aprova no WhatsApp');a.textContent='WhatsApp';a.style.cssText='position:fixed;right:18px;bottom:18px;z-index:80;background:#167d4c;color:#fff;text-decoration:none;padding:13px 16px;border-radius:999px;font-weight:800;box-shadow:0 12px 32px rgba(0,0,0,.2)';document.body.appendChild(a)}

  function modal(){
    let m=document.getElementById('lead-modal');if(m)return m;
    m=document.createElement('div');m.id='lead-modal';m.hidden=true;m.style.cssText='position:fixed;inset:0;z-index:100;overflow:auto';
    m.innerHTML='<div data-close style="position:absolute;inset:0;background:rgba(4,26,53,.7);backdrop-filter:blur(5px)"></div><section style="position:relative;width:min(650px,calc(100% - 24px));margin:4vh auto;background:#fffdf9;border-radius:24px;padding:28px;box-shadow:0 30px 90px rgba(0,0,0,.28)"><button data-close type="button" aria-label="Fechar" style="position:absolute;right:14px;top:12px;border:0;background:transparent;font-size:25px;cursor:pointer">×</button><img src="/assets/trilha-aprova-logo.webp" alt="Trilha Aprova" style="width:110px;height:55px;object-fit:contain;margin-bottom:8px"><div style="font-size:11px;font-weight:900;letter-spacing:.12em;color:#9b762e">PAGAMENTO SEGURO</div><h2 style="font:400 31px Georgia,serif;margin:7px 0;color:#08284f">Finalize sua compra</h2><p style="color:#66717e;line-height:1.5">Apostila Concurso Prefeitura de Santos • Banca IBAM</p><div style="display:flex;align-items:end;gap:12px;margin:10px 0 22px"><del style="font-size:16px;color:#8b929b;text-decoration:line-through 2px #a94b3e">R$ 49,99</del><strong style="font-size:38px;line-height:1;color:#08284f">R$ 24,99</strong></div><form id="lead-form" style="display:grid;gap:11px"><input name="name" autocomplete="name" required placeholder="Nome completo" style="padding:13px;border:1px solid #d9d0c6;border-radius:10px"><input name="email" type="email" autocomplete="email" required placeholder="Seu melhor e-mail" style="padding:13px;border:1px solid #d9d0c6;border-radius:10px"><input name="whatsapp" autocomplete="tel" required placeholder="WhatsApp com DDD" style="padding:13px;border:1px solid #d9d0c6;border-radius:10px"><label style="font-size:12px;color:#66717e;display:flex;gap:8px;align-items:flex-start"><input name="marketing" type="checkbox">Quero receber novidades e ofertas de novos materiais da Trilha Aprova. Posso cancelar quando quiser.</label><button type="submit" style="border:0;background:#08284f;color:#fff;border-radius:11px;padding:15px;font-weight:900;cursor:pointer">Continuar para o pagamento</button><small style="color:#7a8490">Pagamento único. Os dados do cartão são processados diretamente pela Stripe.</small></form><p id="lead-error" style="color:#a33131;font-size:12px"></p><div id="embedded-stage" hidden><div id="embedded-loading" style="padding:14px;text-align:center;color:#66717e">Carregando ambiente seguro da Stripe...</div><div id="embedded-checkout"></div></div></section>';
    document.body.appendChild(m);
    m.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>closeModal());
    m.querySelector('#lead-form').onsubmit=submit;
    return m;
  }
  function closeModal(){const m=document.getElementById('lead-modal');if(!m)return;if(embeddedCheckout){try{embeddedCheckout.destroy()}catch{}embeddedCheckout=null}m.hidden=true;m.querySelector('#lead-form').hidden=false;m.querySelector('#embedded-stage').hidden=true;if(leadSubmitted)window.concursoCRM?.track('checkout_abandoned',{product_slug:slug},true)}

  async function submit(e){
    e.preventDefault();const f=e.currentTarget,b=f.querySelector('button'),err=document.getElementById('lead-error');
    const name=f.elements.name.value.trim(),email=f.elements.email.value.trim().toLowerCase(),whatsapp=f.elements.whatsapp.value.replace(/\D/g,''),marketing=f.elements.marketing.checked,id=identity();
    if(name.length<3||!/^\S+@\S+\.\S+$/.test(email)||whatsapp.length<10){err.textContent='Confira nome, e-mail e WhatsApp.';return}
    b.disabled=true;b.textContent='Preparando pagamento...';err.textContent='';
    try{
      leadSubmitted=true;window.concursoCRM?.track('lead_submitted',{product_slug:slug,value_cents:2499});window.concursoCRM?.track('checkout_started',{product_slug:slug,value_cents:2499});
      const cfg=await stripeConfig();
      const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,name,email,whatsapp,marketingConsent:marketing,analytics:id,embedded:Boolean(cfg.embedded&&cfg.publishableKey)})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Checkout indisponível');
      if(d.mode==='embedded'&&d.clientSecret&&cfg.publishableKey){
        await loadStripeJs();const stripe=window.Stripe(cfg.publishableKey);f.hidden=true;const stage=document.getElementById('embedded-stage');stage.hidden=false;embeddedCheckout=await stripe.initEmbeddedCheckout({clientSecret:d.clientSecret});document.getElementById('embedded-loading').hidden=true;embeddedCheckout.mount('#embedded-checkout');return;
      }
      if(d.url){location.href=d.url;return}
      throw new Error('A Stripe não devolveu um checkout válido.');
    }catch(error){console.error(error);err.textContent='Não foi possível abrir o pagamento agora. Tente novamente.';b.disabled=false;b.textContent='Continuar para o pagamento'}
  }

  buttons.forEach(b=>{b.dataset.crmEvent='add_to_cart';b.dataset.product=slug;b.dataset.valueCents='2499';b.onclick=()=>{const m=modal();m.hidden=false;window.concursoCRM?.track('add_to_cart',{product_slug:slug,value_cents:2499})}});
  loadAnalytics();injectWhats();stripeConfig();
  if(params.get('cancelado')==='1')setTimeout(()=>window.concursoCRM?.track('checkout_abandoned',{product_slug:slug},true),300);
})();
