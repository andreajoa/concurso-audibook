const API='https://ep-dawn-meadow-acq9wpsm.apirest.sa-east-1.aws.neon.tech/neondb/rest/v1';
const AUTH='https://ep-dawn-meadow-acq9wpsm.neonauth.sa-east-1.aws.neon.tech/neondb/auth';
let cached={token:'',expiresAt:0};
async function token(){const now=Date.now()/1000;if(cached.token&&cached.expiresAt>now+60)return cached.token;const r=await fetch(AUTH+'/token/anonymous',{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('CRM auth failed');const d=await r.json();cached={token:d.token,expiresAt:Number(d.expires_at||now+600)};return cached.token;}
async function rpc(name,body){const t=await token();const r=await fetch(API+'/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error('CRM '+name+' failed');return d;}
module.exports={rpc};
