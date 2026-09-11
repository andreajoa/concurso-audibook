import fs from 'node:fs';
import {S3Client,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
const catalog=JSON.parse(fs.readFileSync('products/catalog.json','utf8'));
const accountId=process.env.R2_ACCOUNT_ID||'dbad4dc0550693a69d5956df7344e001';
const bucket=process.env.R2_BUCKET||'apostila';
const accessKeyId=process.env.R2_ACCESS_KEY_ID,secretAccessKey=process.env.R2_SECRET_ACCESS_KEY;
if(!accessKeyId||!secretAccessKey){console.error('FAIL missing R2 credentials');process.exit(1)}
const s3=new S3Client({region:'auto',endpoint:`https://${accountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey}});
let failed=false;const fail=m=>{console.error('FAIL '+m);failed=true},ok=m=>console.log('OK   '+m);
for(const [slug,p] of Object.entries(catalog)){
 const items=[p.assets.coverKey,p.assets.pdfKey,p.assets.summary.key,...(p.assets.chapters||[]).map(x=>x.key)];
 for(const key of items){try{const h=await s3.send(new HeadObjectCommand({Bucket:bucket,Key:key}));if(!Number(h.ContentLength||0))fail(`${slug} ${key} empty`);else ok(`${slug} ${key} • ${h.ContentLength} bytes`)}catch(e){fail(`${slug} ${key} unavailable`)}}
 try{const g=await s3.send(new GetObjectCommand({Bucket:bucket,Key:p.assets.summary.key,Range:'bytes=0-31'}));const bytes=await g.Body.transformToByteArray();if(bytes.length!==32)fail(`${slug} audio range failed`);else ok(`${slug} authenticated audio range delivery`)}catch(e){fail(`${slug} authenticated audio range failed`)}
}
if(failed)process.exit(1);console.log('\nAuthenticated R2 verification passed.');
