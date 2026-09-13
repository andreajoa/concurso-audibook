const { request } = require('../lib/stripe');
const { rpc } = require('../lib/crm-rpc');
const { commercialData } = require('../lib/dashboard-data');
const { catalog } = require('../lib/catalog');
const { examWatch } = require('../lib/exam-watch');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({error:'Método não permitido.'}); }
  const key=String(req.headers['x-dashboard-key']||'');
  if(key.length<20||key.length>256)return res.status(401).json({error:'Acesso negado.'});
  const days=Number(req.body?.days||30);
  if(![1,7,30,90].includes(days))return res.status(400).json({error:'Período inválido.'});
  let activity;
  try { activity=await rpc('crm_dashboard_activity',{p_admin_key:key,p_days:days}); }
  catch { return res.status(401).json({error:'Não foi possível validar o acesso. Confira a credencial e tente novamente.'}); }
  // As datas de prova vêm do catálogo, não do processador de pagamento:
  // o aviso de desativar a apostila precisa aparecer mesmo com a Stripe fora do ar.
  const exams=examWatch(catalog);
  try {
    const all=[];let after='',truncated=false;
    for(let page=0;page<20;page++){
      const params={limit:100,'created[gte]':Math.floor(new Date(activity.since).getTime()/1000)};
      if(after)params.starting_after=after;
      const result=await request('/checkout/sessions',{method:'GET',params});
      const rows=Array.isArray(result.data)?result.data:[];all.push(...rows);
      truncated=Boolean(result.has_more);
      if(!truncated||!rows.length)break;
      after=rows[rows.length-1].id;
    }
    const ids=all.filter(s=>s.metadata?.site_id==='concurso_audiobook'&&s.metadata?.project_id==='concurso_audiobook').map(s=>s.id);
    const usage=[];
    for(let i=0;i<ids.length;i+=100)usage.push(...await rpc('crm_order_usage_batch',{p_admin_key:key,p_sessions:ids.slice(i,i+100)}));
    return res.status(200).json({activity,exams,commerce:commercialData(all,usage,truncated)});
  } catch {
    return res.status(200).json({activity,exams,commerce:null,warning:'Os pagamentos não puderam ser consultados agora. Os indicadores de visitas continuam disponíveis.'});
  }
};
