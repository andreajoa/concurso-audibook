const { sendContactEmail }=require('./email');
const attempts=new Map();
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método não permitido.'});}
  try{const origin=req.headers.origin;if(origin&&new URL(origin).host!==String(req.headers['x-forwarded-host']||req.headers.host).split(',')[0].trim())return res.status(403).json({error:'Origem inválida.'});}catch{return res.status(403).json({error:'Origem inválida.'});}
  if(Number(req.headers['content-length']||0)>16000)return res.status(413).json({error:'Mensagem muito longa.'});
  const b=req.body&&typeof req.body==='object'?req.body:{};
  if(b.website)return res.status(200).json({ok:true});
  const clean=(v,max)=>String(v||'').trim().slice(0,max);
  const name=clean(b.name,160).replace(/[\r\n]/g,' '),email=clean(b.email,240).toLowerCase(),phone=clean(b.phone,30),subject=clean(b.subject,160).replace(/[\r\n]/g,' '),message=clean(b.message,6000),requestId=clean(b.requestId,80);
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.replace(/\D/g,'').length<10||subject.length<3||message.length<10||!/^[-a-zA-Z0-9]{16,80}$/.test(requestId))return res.status(400).json({error:'Confira os campos. A mensagem precisa ter pelo menos 10 caracteres.'});
  const now=Date.now(),ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0];for(const [k,v]of attempts)if(now-v.start>600000)attempts.delete(k);const state=attempts.get(ip)||{start:now,count:0};state.count++;attempts.set(ip,state);if(state.count>5)return res.status(429).json({error:'Aguarde alguns minutos antes de enviar outra mensagem.'});
  try{await sendContactEmail({name,phone,email,subject,message,requestId});return res.status(200).json({ok:true});}
  catch{return res.status(503).json({error:'Não foi possível enviar agora. Tente novamente ou escreva para suporte@concursotrilhaaprova.online.'});}
};
