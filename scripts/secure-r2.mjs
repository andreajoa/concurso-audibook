import fs from 'node:fs';
import {S3Client,HeadBucketCommand,CreateBucketCommand,GetObjectCommand,PutObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
const accountId=process.env.R2_ACCOUNT_ID||'dbad4dc0550693a69d5956df7344e001';
const accessKeyId=process.env.R2_ACCESS_KEY_ID,secretAccessKey=process.env.R2_SECRET_ACCESS_KEY;
const source=process.env.R2_SOURCE_BUCKET||'apostila',target=process.env.R2_TARGET_BUCKET||'apostila-paga';
if(!accessKeyId||!secretAccessKey)throw new Error('Missing R2 credentials');
const s3=new S3Client({region:'auto',endpoint:`https://${accountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId,secretAccessKey}});
try{await s3.send(new HeadBucketCommand({Bucket:target}));console.log('Target bucket exists:',target)}catch{console.log('Creating private target bucket:',target);await s3.send(new CreateBucketCommand({Bucket:target}))}
const catalog=JSON.parse(fs.readFileSync('products/catalog.json','utf8'));
const keys=[];for(const p of Object.values(catalog)){keys.push(p.assets.coverKey,p.assets.pdfKey,p.assets.summary.key,...(p.assets.chapters||[]).map(x=>x.key))}
for(const key of [...new Set(keys)]){const src=await s3.send(new GetObjectCommand({Bucket:source,Key:key}));const body=await src.Body.transformToByteArray();await s3.send(new PutObjectCommand({Bucket:target,Key:key,Body:body,ContentType:src.ContentType||undefined,ContentDisposition:src.ContentDisposition||undefined,CacheControl:'private, no-store'}));const check=await s3.send(new HeadObjectCommand({Bucket:target,Key:key}));if(Number(check.ContentLength||0)!==body.length)throw new Error(`Size mismatch for ${key}`);console.log('Copied',key,body.length)}
console.log(`PRIVATE_R2_READY bucket=${target} objects=${new Set(keys).size}`);
