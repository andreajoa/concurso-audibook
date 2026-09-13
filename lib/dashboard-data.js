const { getProduct } = require('./catalog');
const isTest = session => /@(example\.com|example\.org|example\.net)$/i.test(String(session.customer_details?.email || session.customer_email || '')) || /^(qa|test|automation)$/i.test(session.metadata?.analytics_source || '');
function commercialData(sessions, usage, truncated) {
  const rows = sessions.filter(s => s.metadata?.site_id === 'concurso_audiobook' && s.metadata?.project_id === 'concurso_audiobook' && s.livemode !== false && !isTest(s));
  const usageMap = new Map(usage.map(item => [item.stripe_session_id, item]));
  const paid = rows.filter(s => s.payment_status === 'paid');
  const byEmail = new Map();
  for (const s of paid) { const email = String(s.customer_details?.email || s.customer_email || '').toLowerCase(); if (email) byEmail.set(email, (byEmail.get(email) || 0) + 1); }
  const products = new Map();
  for (const s of paid) { const slug = s.metadata.product_slug; const p = products.get(slug) || {slug,name:getProduct(slug)?.shortName || slug,paid:0,revenue_cents:0};p.paid++;if(s.currency === 'brl')p.revenue_cents+=Number(s.amount_total||0);products.set(slug,p); }
  const daily = new Map();
  for(const s of paid){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.created*1000));daily.set(day,(daily.get(day)||0)+1);}
  return {truncated, checkout_count:rows.length,paid_orders:paid.length,
    revenue_cents:paid.filter(s=>s.currency==='brl').reduce((sum,s)=>sum+Number(s.amount_total||0),0),
    other_currency_orders:paid.filter(s=>s.currency!=='brl').length,
    pending:rows.filter(s=>s.payment_status!=='paid'&&s.status==='open').length,
    expired:rows.filter(s=>s.payment_status!=='paid'&&s.status==='expired').length,
    repeat_buyers:[...byEmail.values()].filter(n=>n>1).length,
    products:[...products.values()],daily:[...daily].map(([day,paid])=>({day,paid})),
    rows:rows.slice(0,100).map(s=>({name:s.customer_details?.name||'',email:s.customer_details?.email||s.customer_email||'',
      product:getProduct(s.metadata.product_slug)?.shortName||s.metadata.product_slug,
      payment_status:s.payment_status,status:s.status,amount_total:Number(s.amount_total||0),currency:s.currency,
      created_at:new Date(s.created*1000).toISOString(),access_count:usageMap.get(s.id)?.access_count??null,
      pdf_downloads:usageMap.get(s.id)?.pdf_downloads??null,audio_plays:usageMap.get(s.id)?.audio_plays??null}))};
}
module.exports={commercialData};
