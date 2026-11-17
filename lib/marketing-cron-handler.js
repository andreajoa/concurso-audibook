const {request}=require('./stripe');
const {sendRecoveryEmail}=require('./email');
const {dueStep}=require('./recovery');
const {rpc}=require('./crm-rpc');
const {getSellableProduct}=require('./catalog');
const SITE_ID='concurso_audiobook',PROJECT_ID='concurso_audiobook';

async function sessionsSince(gte){
  const all=[];let startingAfter='';
  for(let page=0;page<20;page++){
    const params={limit:100,'created[gte]':gte};
    if(startingAfter)params.starting_after=startingAfter;
    const result=await request('/checkout/sessions',{method:'GET',params});
    const rows=Array.isArray(result.data)?result.data:[];all.push(...rows);
    if(!result.has_more||!rows.length)break;
    startingAfter=rows[rows.length-1].id;
  }
  return all;
}

module.exports=async(req,res)=>{
  const secret=process.env.CRON_SECRET;
  if(!secret||req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:'Unauthorized'});
  try{
    // 17/11/2026: sequência POR APOSTILA (lib/recovery.js). Antes: 30 e-mails genéricos de "autores IBAM" para qualquer abandono.
    const now=new Date(),since=Math.floor((now.getTime()-80*86400000)/1000),sessions=await sessionsSince(since);
    const owned=new Set(),latest=new Map();
    for(const s of sessions){
      const m=s.metadata||{};
      if(m.site_id!==SITE_ID||m.project_id!==PROJECT_ID)continue;
      const email=String(s.customer_details?.email||s.customer_email||'').trim().toLowerCase();
      if(!email||!m.product_slug)continue;
      if(s.payment_status==='paid')owned.add(`${email}|${m.product_slug}`);
      else if(s.status==='expired'&&m.marketing_consent==='true'){
        const key=`${email}|${m.product_slug}`,prev=latest.get(key);
        if(!prev||Number(s.created)>Number(prev.created))latest.set(key,s);   // um abandono por pessoa+apostila: o mais recente
      }
    }
    const origin=String(process.env.APP_BASE_URL||'https://www.concursotrilhaaprova.online').replace(/\/$/,'');
    let delivered=0,skipped=0;
    for(const [key,session] of latest){
      const [email,slug]=key.split('|');
      if(owned.has(key)){skipped++;continue;}
      const product=getSellableProduct(slug,now);
      if(!product){skipped++;continue;}
      const step=dueStep(product,session.created,now);
      if(!step)continue;
      const unsub=await rpc('crm_is_unsubscribed',{p_email:email}).catch(()=>false);
      if(unsub===true){skipped++;continue;}
      const ctaUrl=session.after_expiration?.recovery?.url&&Number(session.after_expiration.recovery.expires_at)*1000>now.getTime()
        ?session.after_expiration.recovery.url
        :`${origin}/comprar.html?produto=${encodeURIComponent(product.slug)}&utm_source=email&utm_medium=automation&utm_campaign=recovery_${step}`;
      await sendRecoveryEmail({to:email,step,product,origin,now,ctaUrl,idempotencyKey:`recovery-${step}-${session.id}`});
      delivered++;
    }
    return res.status(200).json({ok:true,delivered,skipped,checked:sessions.length});
  }catch(error){console.error('marketing_cron',error);return res.status(500).json({error:'worker_failed'});}
};
