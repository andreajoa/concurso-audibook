const campaigns=require('../products/email-campaigns.json');
const {request}=require('../lib/stripe');
const {sendMarketingEmail}=require('../lib/email');
const {rpc}=require('../lib/crm-rpc');
const {getProduct}=require('../lib/catalog');
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
    const now=Date.now(),since=Math.floor((now-112*86400000)/1000),sessions=await sessionsSince(since);
    const owned=new Set(),candidates=[];
    for(const s of sessions){
      const m=s.metadata||{};
      if(m.site_id!==SITE_ID||m.project_id!==PROJECT_ID)continue;
      const email=String(s.customer_details?.email||s.customer_email||'').trim().toLowerCase();
      if(!email)continue;
      if(s.payment_status==='paid')owned.add(email);
      else if(s.status==='expired'&&m.marketing_consent==='true')candidates.push({session:s,email});
    }
    const sent=new Set(),origin=String(process.env.APP_BASE_URL||'https://concurso-audibook.vercel.app').replace(/\/$/,'');
    let delivered=0,skipped=0;
    for(const {session,email} of candidates){
      if(owned.has(email)){skipped++;continue;}
      const unsub=await rpc('crm_is_unsubscribed',{p_email:email}).catch(()=>false);
      if(unsub===true){skipped++;continue;}
      const ageDays=Math.floor((now-Number(session.created)*1000)/86400000);
      const due=campaigns.filter(c=>Number(c.dayOffset)===ageDays);
      const product=getProduct(session.metadata?.product_slug||'autores-ibam-2026');
      if(!product)continue;
      for(const campaign of due){
        const key=`${email}:${campaign.id}`;
        if(sent.has(key))continue;
        sent.add(key);
        const ctaUrl=`${origin}/comprar.html?produto=${encodeURIComponent(product.slug)}&utm_source=email&utm_medium=automation&utm_campaign=${encodeURIComponent(campaign.id)}`;
        await sendMarketingEmail({to:email,subject:campaign.subject,title:campaign.title,bodyHtml:campaign.body,ctaLabel:campaign.cta,ctaUrl,origin,campaign:campaign.id,idempotencyKey:`concurso-${session.id}-${campaign.id}`});
        delivered++;
      }
    }
    return res.status(200).json({ok:true,delivered,skipped,checked:sessions.length});
  }catch(error){console.error('marketing_cron',error);return res.status(500).json({error:'worker_failed'});}
};
