const contact=require('../lib/contact-handler');
const newsletter=require('../lib/newsletter-handler');
const caderno=require('../lib/caderno-sync');
/* Um POST, três destinos. O plano da Vercel dá doze funções e as doze estão
   ocupadas: multiplexar por `kind` é o que mantém o site dentro do orçamento
   sem transformar cada formulário novo numa decisão de infraestrutura. */
const membro=require('../lib/member');
module.exports=(req,res)=>{
  // Clube de membros: o link do e-mail de confirmação chega aqui por GET.
  if(req.method==='GET'&&(req.query||{}).membro)return membro.confirm(req,res,String(req.query.membro));
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
  if(req.body?.kind==='membro'){const proto=req.headers['x-forwarded-proto']||'https',host=String(req.headers['x-forwarded-host']||req.headers.host).split(',')[0].trim();return membro.signup(req,res,req.body,(process.env.APP_BASE_URL||`${proto}://${host}`).replace(/\/$/,'')).catch(e=>{console.error('membro',e);res.status(503).json({error:'Não conseguimos registrar agora. Tente novamente em instantes.'})});}
  if(req.body?.kind==='contact')return contact(req,res);
  if(req.body?.kind==='newsletter')return newsletter(req,res);
  if(req.body?.kind==='caderno')return caderno(req,res);
  return res.status(400).json({error:'Solicitação inválida.'});
};
