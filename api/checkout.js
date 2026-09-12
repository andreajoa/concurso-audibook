const { createCheckout } = require('../lib/checkout-hosted');
const { getProduct } = require('../lib/catalog');
const { rpc } = require('../lib/crm-rpc');

async function getJsonBody(req){
  if(req.body&&typeof req.body==='object')return req.body;
  let raw='';for await(const chunk of req)raw+=chunk;
  if(!raw)return{};
  try{return JSON.parse(raw)}catch{return{}};
}
const clean=(value,max)=>String(value||'').trim().slice(0,max);

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method==='GET'){
    const publishableKey=String(process.env.STRIPE_PUBLISHABLE_KEY||'').trim();
    return res.status(200).json({embedded:Boolean(publishableKey),publishableKey});
  }
  if(req.method!=='POST'){
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({error:'Método não permitido.'});
  }
  try{
    const body=await getJsonBody(req);
    const slug=clean(body.slug||'autores-ibam-2026',120);
    const product=getProduct(slug);
    if(!product)return res.status(400).json({error:'Produto indisponível.'});
    const name=clean(body.name,180);
    const email=clean(body.email,240).toLowerCase();
    const whatsapp=String(body.whatsapp||'').replace(/\D/g,'').slice(0,15);
    const analytics=body.analytics&&typeof body.analytics==='object'?body.analytics:{};
    const marketingConsent=body.marketingConsent===true;
    const embedded=body.embedded===true&&Boolean(String(process.env.STRIPE_PUBLISHABLE_KEY||'').trim());
    if(name.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||whatsapp.length<10){
      return res.status(400).json({error:'Confira nome, e-mail e WhatsApp.'});
    }
    await rpc('crm_upsert_lead',{payload:{email,name,whatsapp,product_slug:slug,marketing_consent:marketingConsent,visitor_id:clean(analytics.visitorId,120),session_id:clean(analytics.sessionId,120)}}).catch(error=>console.error('crm_upsert_lead',error));
    const session=await createCheckout(req,slug,{email,analytics,marketingConsent,embedded});
    await rpc('crm_mark_checkout',{payload:{email,name,whatsapp,product_slug:slug,marketing_consent:marketingConsent,visitor_id:clean(analytics.visitorId,120),session_id:clean(analytics.sessionId,120),source:clean(analytics.source,120),medium:clean(analytics.medium,80),campaign:clean(analytics.campaign,240),stripe_session_id:session.id,amount_total_cents:product.priceCents,currency:product.currency}}).catch(error=>console.error('crm_mark_checkout',error));
    if(embedded){
      if(!session.client_secret)throw new Error('Stripe embedded checkout did not return client_secret.');
      return res.status(200).json({mode:'embedded',clientSecret:session.client_secret,sessionId:session.id});
    }
    if(!session.url)throw new Error('Stripe hosted checkout did not return URL.');
    return res.status(200).json({mode:'hosted',url:session.url,sessionId:session.id});
  }catch(error){
    console.error('checkout',error);
    return res.status(500).json({error:'Não foi possível iniciar o pagamento agora. Tente novamente.'});
  }
};
