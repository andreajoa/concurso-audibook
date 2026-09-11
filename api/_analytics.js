const AUTH_URL = 'https://ep-dawn-meadow-acq9wpsm.neonauth.sa-east-1.aws.neon.tech/neondb/auth';
const DATA_API_URL = 'https://ep-dawn-meadow-acq9wpsm.apirest.sa-east-1.aws.neon.tech/neondb/rest/v1';
const SITE_ID = 'concurso_audiobook';
const BOT_RE = /bot|crawler|spider|crawling|headless|slurp|bingpreview|facebookexternalhit|googleother/i;
const ID_RE = /^[A-Za-z0-9:_-]{8,120}$/;
const EVENT_RE = /^(page_view|engagement|link_click|scroll_depth|session_end|cta_click|outbound_click|add_to_cart|lead_submitted|checkout_started|checkout_abandoned|payment_failed|purchase|purchase_page|access_open|pdf_open|pdf_download|audio_play|audio_download|whatsapp_click|email_landing)$/;
const cache = globalThis;
if (!cache.__concursoAnonToken) cache.__concursoAnonToken = { token:'', expiresAt:0 };

function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || '');
}
function decode(value){ try { return decodeURIComponent(value || ''); } catch { return String(value || ''); } }
function text(value,max=500){ return typeof value === 'string' ? value.trim().slice(0,max) : ''; }
function integer(value,min=0,max=100000000){ const n=Number(value); return Number.isFinite(n) ? Math.min(max,Math.max(min,Math.round(n))) : 0; }
function readBody(req){ if(req.body && typeof req.body==='object' && !Buffer.isBuffer(req.body)) return req.body; try{return JSON.parse(Buffer.isBuffer(req.body)?req.body.toString('utf8'):String(req.body||'{}'));}catch{return{};} }
function sameOrigin(req){ const origin=header(req,'origin'); if(!origin) return true; try{ const host=(header(req,'x-forwarded-host').split(',')[0].trim()||header(req,'host')); return new URL(origin).hostname===host; }catch{return false;} }

function sanitize(input){
  const event_id=text(input.event_id,120), session_id=text(input.session_id,120), visitor_id=text(input.visitor_id,120), event_name=text(input.event_name,40);
  const parent_session_id=text(input.parent_session_id,120);
  if(!ID_RE.test(event_id)||!ID_RE.test(session_id)||!ID_RE.test(visitor_id)||!EVENT_RE.test(event_name)) return null;
  if(parent_session_id&&!ID_RE.test(parent_session_id)) return null;
  return {
    site_id:SITE_ID,event_id,session_id,visitor_id,parent_session_id,event_name,
    path:text(input.path,500)||'/',landing_path:text(input.landing_path,500)||'/',landing_query:text(input.landing_query,1500),referrer:text(input.referrer,1500),
    source:text(input.source,120),medium:text(input.medium,80),campaign:text(input.campaign,240),device_type:text(input.device_type,40)||'unknown',browser:text(input.browser,80)||'unknown',os:text(input.os,80)||'unknown',language:text(input.language,40),
    screen_width:integer(input.screen_width,0,10000),screen_height:integer(input.screen_height,0,10000),viewport_width:integer(input.viewport_width,0,10000),viewport_height:integer(input.viewport_height,0,10000),
    duration_seconds:integer(input.duration_seconds,0,86400),max_scroll:integer(input.max_scroll,0,100),seconds_before_click:integer(input.seconds_before_click,0,86400),
    link_id:text(input.link_id,120),link_label:text(input.link_label,500),target_url:text(input.target_url,1500),section:text(input.section,120),
    product_slug:text(input.product_slug||input.product_id,120),product_name:text(input.product_name,500),value_cents:integer(input.value_cents,0,100000000),stripe_session_id:text(input.stripe_session_id||input.transaction_id,160),
    metadata: input.metadata && typeof input.metadata==='object' ? input.metadata : {}
  };
}

async function anonymousToken(){
  const now=Math.floor(Date.now()/1000), current=cache.__concursoAnonToken;
  if(current.token&&current.expiresAt>now+90) return current.token;
  const response=await fetch(`${AUTH_URL}/token/anonymous`,{headers:{Accept:'application/json',Origin:'https://concurso-audibook.vercel.app'},signal:AbortSignal.timeout(8000),cache:'no-store'});
  if(!response.ok) throw new Error(`crm_auth_${response.status}`);
  const data=await response.json();
  if(!data.token) throw new Error('crm_auth_missing_token');
  current.token=data.token; current.expiresAt=Number(data.expires_at||now+600); return current.token;
}

async function callRpc(name, body){
  const token=await anonymousToken();
  const response=await fetch(`${DATA_API_URL}/rpc/${name}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`crm_rpc_${response.status}`);
  return data;
}

async function recordEvent(payload){
  const clean=sanitize(payload);
  if(!clean) return {ok:false};
  return callRpc('crm_track_event',{payload:clean});
}

function trackHandler(){ return async function(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='POST'){ res.setHeader('Allow','POST'); return res.status(405).end(); }
  if(!sameOrigin(req)) return res.status(403).end();
  if(BOT_RE.test(header(req,'user-agent'))) return res.status(204).end();
  if(Number(header(req,'content-length')||0)>36000) return res.status(413).end();
  try{
    const payload=sanitize(readBody(req));
    if(!payload) return res.status(400).end();
    payload.city=decode(header(req,'x-vercel-ip-city')).slice(0,160);
    payload.region=decode(header(req,'x-vercel-ip-country-region')).slice(0,100);
    payload.country=decode(header(req,'x-vercel-ip-country')).slice(0,8);
    payload.timezone=decode(header(req,'x-vercel-ip-timezone')).slice(0,120);
    await callRpc('crm_track_event',{payload});
    return res.status(204).end();
  }catch(error){ console.error('crm_track_error',error); return res.status(202).end(); }
}; }

module.exports={SITE_ID,sanitize,recordEvent,trackHandler};
