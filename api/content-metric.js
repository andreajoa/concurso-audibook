const {verifyPurchase}=require('../lib/stripe');
const {rpc}=require('../lib/crm-rpc');
const ALLOWED=new Set(['access_open','pdf_download','audio_play','audio_download']);
module.exports=async(req,res)=>{if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});try{const b=req.body||{},sessionId=String(b.session_id||''),event=String(b.event||'');if(!ALLOWED.has(event))return res.status(400).json({error:'Evento inválido.'});const purchase=await verifyPurchase(sessionId);if(!purchase)return res.status(403).json({error:'Acesso inválido.'});await rpc('crm_order_metric',{p_session:sessionId,p_event:event});res.setHeader('Cache-Control','private, no-store');return res.status(204).end();}catch(e){console.error('content_metric',e);return res.status(202).end();}};
