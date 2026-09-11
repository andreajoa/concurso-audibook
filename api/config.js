module.exports = async (req,res)=>{
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método não permitido.'});}
  const key=String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY||process.env.STRIPE_PUBLISHABLE_KEY||'').trim();
  if(!key.startsWith('pk_')) return res.status(500).json({error:'Checkout ainda não configurado.'});
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  return res.status(200).json({publishableKey:key});
};
