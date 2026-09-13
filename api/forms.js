const contact=require('../lib/contact-handler');
const newsletter=require('../lib/newsletter-handler');
module.exports=(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
  if(req.body?.kind==='contact')return contact(req,res);
  if(req.body?.kind==='newsletter')return newsletter(req,res);
  return res.status(400).json({error:'Solicitação inválida.'});
};
