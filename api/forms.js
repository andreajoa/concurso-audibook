const contact=require('../lib/contact-handler');
const newsletter=require('../lib/newsletter-handler');
const caderno=require('../lib/caderno-sync');
/* Um POST, três destinos. O plano da Vercel dá doze funções e as doze estão
   ocupadas: multiplexar por `kind` é o que mantém o site dentro do orçamento
   sem transformar cada formulário novo numa decisão de infraestrutura. */
module.exports=(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
  if(req.body?.kind==='contact')return contact(req,res);
  if(req.body?.kind==='newsletter')return newsletter(req,res);
  if(req.body?.kind==='caderno')return caderno(req,res);
  return res.status(400).json({error:'Solicitação inválida.'});
};
