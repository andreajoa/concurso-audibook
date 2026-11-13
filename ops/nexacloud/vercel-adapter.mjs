import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT=process.cwd(),PORT=Number(process.env.PORT||3000);
let cfg={};try{cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));}catch{}
const STATIC=fs.existsSync(path.join(ROOT,cfg.outputDirectory||'public'))?path.join(ROOT,cfg.outputDirectory||'public'):ROOT;
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.pdf':'application/pdf','.mp4':'video/mp4','.mp3':'audio/mpeg','.m4a':'audio/mp4','.webmanifest':'application/manifest+json'};

// @vercel/functions waitUntil: keep the promise alive and log its failure (the process is long-lived here).
globalThis[Symbol.for('@vercel/request-context')]={get:()=>({waitUntil:p=>Promise.resolve(p).catch(e=>console.error('waitUntil',e)),headers:{}})};

// Functions: api/**/*.{js,mjs,cjs}; [name] segments are dynamic, like on Vercel.
const fns=[];
(function scan(dir,base){let list=[];try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
 for(const e of list){if(e.name.startsWith('.')||e.name.startsWith('_')||e.name==='node_modules')continue;const full=path.join(dir,e.name);
  if(e.isDirectory()){scan(full,base+'/'+e.name);continue;}
  const m=/^(.*)\.(js|mjs|cjs)$/.exec(e.name);if(!m)continue;
  const route=m[1]==='index'?base:base+'/'+m[1],params=[];
  const re=new RegExp('^'+route.split('/').map(s=>{const d=/^\[(\.\.\.)?(\w+)\]$/.exec(s);if(!d)return s.replace(/[.*+?^$()|{}\\]/g,'\\$&');params.push(d[2]);return d[1]?'(.+)':'([^/]+)';}).join('/')+(m[1]==='index'?'(?:/index)?':'')+'/?$');
  fns.push({file:full,route,re,params,dynamic:params.length>0});}})(path.join(ROOT,'api'),'/api');
fns.sort((a,b)=>a.dynamic-b.dynamic||b.route.length-a.route.length);
const findFn=p=>{for(const f of fns){const m=f.re.exec(p);if(m){const q={};f.params.forEach((n,i)=>{q[n]=m[i+1];});return {f,q};}}return null;};
const loaded=new Map();
async function load(file){if(!loaded.has(file))loaded.set(file,import(pathToFileURL(file).href));return loaded.get(file);}

function staticFile(p){
 let rel;try{rel=decodeURIComponent(p);}catch{return null;}
 if(rel.includes('\0'))return null;
 const base=path.resolve(STATIC),cands=[rel,rel+'.html',path.join(rel,'index.html')];
 for(const c of cands){const full=path.resolve(base,'.'+path.sep+c);if(!full.startsWith(base))continue;try{if(fs.statSync(full).isFile())return full;}catch{}}
 return null;
}
// vercel.json "source" patterns: :name, :name*, (.*) and plain regex groups.
function sourceRe(src){const names=[];const body=src.replace(/:(\w+)(\*|\+|\?)?/g,(_,n,mod)=>{names.push(n);return mod==='*'?'(.*)':mod==='+'?'(.+)':'([^/]+)';});return {re:new RegExp('^'+body+'$'),names};}
function fill(dest,m,names){let out=dest;names.forEach((n,i)=>{out=out.split(':'+n+'*').join(m[i+1]||'').split(':'+n).join(m[i+1]||'');});return out.replace(/\$(\d+)/g,(_,i)=>m[Number(i)]||'');}

function helpers(req,res,url,query){
 req.query=query;req.cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(c=>c.trim().split('=')).filter(x=>x[0]).map(([k,...v])=>[k,decodeURIComponent(v.join('='))]));
 res.status=c=>{res.statusCode=c;return res;};
 res.json=o=>{if(!res.getHeader('content-type'))res.setHeader('content-type','application/json; charset=utf-8');res.end(JSON.stringify(o));return res;};
 res.send=b=>{if(b===undefined||b===null){res.end();return res;}if(typeof b==='object'&&!Buffer.isBuffer(b))return res.json(b);if(!res.getHeader('content-type'))res.setHeader('content-type',Buffer.isBuffer(b)?'application/octet-stream':'text/html; charset=utf-8');res.end(b);return res;};
 res.redirect=(a,b)=>{const [code,loc]=typeof a==='number'?[a,b]:[307,a];res.statusCode=code;res.setHeader('location',loc);res.end();return res;};
}
async function readBody(req){const c=[];for await(const x of req)c.push(x);return Buffer.concat(c);}
function parseBody(buf,type){if(!buf.length)return undefined;const t=(type||'').split(';')[0].trim();const s=buf.toString('utf8');
 if(t==='application/json'){try{return JSON.parse(s);}catch{return s;}}
 if(t==='application/x-www-form-urlencoded')return Object.fromEntries(new URLSearchParams(s));
 if(t.startsWith('text/'))return s;return buf;}

async function runFn(hit,req,res,url){
 const mod=await load(hit.f.file);
 const query={...Object.fromEntries(url.searchParams),...hit.q};
 const web=mod[req.method]||(mod.default&&typeof mod.default.fetch==='function'?mod.default.fetch.bind(mod.default):null);
 if(web){
  const body=['GET','HEAD'].includes(req.method)?undefined:await readBody(req);
  const r=new Request('https://'+(req.headers.host||'localhost')+req.url,{method:req.method,headers:Object.entries(req.headers).filter(([,v])=>typeof v==='string'),body});
  const out=await web(r);res.statusCode=out.status;out.headers.forEach((v,k)=>res.setHeader(k,v));
  if(out.body&&req.method!=='HEAD'){for await(const c of out.body)res.write(c);}res.end();return;
 }
 const fn=typeof mod.default==='function'?mod.default:typeof mod.handler==='function'?mod.handler:null;
 if(!fn){res.statusCode=500;res.end('This function has no default export');return;}
 helpers(req,res,url,query);
 if(!(mod.config&&mod.config.api&&mod.config.api.bodyParser===false)&&!['GET','HEAD'].includes(req.method)){const buf=await readBody(req);req.body=parseBody(buf,req.headers['content-type']);}
 await fn(req,res);
}

async function serve(req,res,p,url,depth){
 const fileHit=()=>{const f=staticFile(p);if(f&&!p.startsWith('/api/')){res.setHeader('content-type',TYPES[path.extname(f).toLowerCase()]||'application/octet-stream');if(req.method==='HEAD')return res.end(),true;fs.createReadStream(f).pipe(res);return true;}return false;};
 if(Array.isArray(cfg.routes)){
  let filesystemDone=false;
  for(const r of cfg.routes){
   if(r.handle==='filesystem'){filesystemDone=true;if(fileHit())return;const fh=findFn(p);if(fh)return runFn(fh,req,res,url);continue;}
   if(!r.src)continue;if(r.methods&&!r.methods.includes(req.method))continue;
   const m=new RegExp('^'+r.src.replace(/^\^/,'').replace(/\$$/,'')+'$').exec(p);if(!m)continue;
   if(r.headers)for(const [k,v] of Object.entries(r.headers))res.setHeader(k,v);
   if(r.status&&!r.dest){res.statusCode=r.status;return res.end();}
   if(r.dest){const d=fill(r.dest,m,[]);if(r.status&&r.status>=300&&r.status<400){res.statusCode=r.status;res.setHeader('location',d);return res.end();}
    const np=d.split('?')[0];const fh=findFn(np);if(fh)return runFn(fh,req,res,url);if(depth<5&&np!==p)return serve(req,res,np,url,depth+1);}
   if(!r.continue&&r.dest)break;
  }
  if(!filesystemDone){if(fileHit())return;const fh=findFn(p);if(fh)return runFn(fh,req,res,url);}
 }else{
  for(const r of cfg.redirects||[]){const {re,names}=sourceRe(r.source);const m=re.exec(p);if(m){res.statusCode=r.statusCode||(r.permanent===false?307:308);res.setHeader('location',fill(r.destination,m,names));return res.end();}}
  for(const h of cfg.headers||[]){const {re}=sourceRe(h.source);if(re.test(p))for(const x of h.headers||[])res.setHeader(x.key,x.value);}
  if(fileHit())return;
  let fh=findFn(p);if(fh)return runFn(fh,req,res,url);
  for(const r of cfg.rewrites||[]){const {re,names}=sourceRe(r.source);const m=re.exec(p);if(!m)continue;const d=fill(r.destination,m,names);if(/^https?:/.test(d)){res.statusCode=502;return res.end('External rewrites are not supported');}
   const [np,dq]=d.split('?');if(dq){url=new URL(url.href);new URLSearchParams(dq).forEach((v,k)=>url.searchParams.set(k,v));}fh=findFn(np);if(fh)return runFn(fh,req,res,url);if(depth<5)return serve(req,res,np,url,depth+1);}
 }
 const nf=staticFile('/404.html');res.statusCode=404;if(nf){res.setHeader('content-type','text/html; charset=utf-8');return fs.createReadStream(nf).pipe(res);}res.end('Not found');
}

http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://'+(req.headers.host||'localhost'));
 try{await serve(req,res,url.pathname,url,0);}
 catch(e){console.error(e);if(!res.headersSent){res.statusCode=500;res.end('Function error');}else res.end();}
}).listen(PORT,'0.0.0.0',()=>console.log('NexaCloud functions adapter on '+PORT+' ('+fns.length+' functions)'));
