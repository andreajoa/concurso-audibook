const { rpc } = require('./crm-rpc');
const attempts = new Map();
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
  const origin=String(req.headers.origin||'');
  try{if(origin&&new URL(origin).host!==String(req.headers['x-forwarded-host']||req.headers.host).split(',')[0].trim())return res.status(403).json({error:'Origem inválida.'});}catch{return res.status(403).json({error:'Origem inválida.'});}
  if(Number(req.headers['content-length']||0)>4000)return res.status(413).json({error:'Solicitação muito grande.'});
  const body=req.body&&typeof req.body==='object'?req.body:{};
  if(body.website)return res.status(200).json({ok:true});
  const email=String(body.email||'').trim().toLowerCase();
  if(email.length>240||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||body.consent!==true)return res.status(400).json({error:'Informe um e-mail válido e autorize o recebimento das novidades.'});
  const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0];
  const now=Date.now();for(const [key,value] of attempts)if(now-value.start>600000)attempts.delete(key);
  const state=attempts.get(ip)||{start:now,count:0};state.count++;attempts.set(ip,state);
  if(state.count>10)return res.status(429).json({error:'Aguarde alguns minutos antes de tentar novamente.'});
  // A origem diz de onde veio o interesse — "concursos:sp/guarulhos" é quem
  // pediu aviso de edital naquela cidade. Vem do cliente, então é conferida
  // contra um formato fechado em vez de aceita como texto livre.
  const source=/^concursos:[a-z]{2}(\/[a-z0-9-]{1,48})?$/.test(String(body.source||''))?body.source:'storefront';
  try{const result=await rpc('crm_newsletter_signup',{payload:{email,consent:true,source}});if(result?.ok!==true)throw new Error('signup_failed');return res.status(200).json({ok:true});}
  catch{return res.status(503).json({error:'Não conseguimos registrar agora. Tente novamente em instantes.'});}
};
