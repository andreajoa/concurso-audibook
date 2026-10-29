#!/usr/bin/env python3
"""Upload validated Fiscal de Obras files exclusively to the existing private R2 bucket."""
import os,sys,json,hashlib
from pathlib import Path
import boto3, requests
from botocore.exceptions import ClientError
from publish_fiscal_obras_media import META,validate
base=Path(sys.argv[1])
rows=validate(base)
account=os.environ['R2_ACCOUNT_ID']
client=boto3.client('s3',endpoint_url='https://'+account+'.r2.cloudflarestorage.com',region_name='auto',aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'])
bucket='apostila'
client.head_bucket(Bucket=bucket)
for row in rows:
 key=row['key']; src=base/row['file']
 try:
  existing=client.head_object(Bucket=bucket,Key=key)
 except ClientError as e:
  if e.response.get('ResponseMetadata',{}).get('HTTPStatusCode')==404:existing=None
  else:raise
 if existing:
  assert existing['ContentLength']==row['bytes'] and existing.get('Metadata',{}).get('sha256')==row['sha256'],key
  print('PRESERVED_EXISTING',key,flush=True)
 else:
  client.upload_file(str(src),bucket,key,ExtraArgs={'ContentType':row['contentType'],'CacheControl':'private, no-store','Metadata':{'sha256':row['sha256']}})
  print('UPLOADED',key,flush=True)
 result=client.head_object(Bucket=bucket,Key=key)
 assert result['ContentLength']==row['bytes'] and result['Metadata']['sha256']==row['sha256']
 url=client.generate_presigned_url('get_object',Params={'Bucket':bucket,'Key':key},ExpiresIn=120)
 resp=requests.get(url,headers={'Range':'bytes=0-31'},timeout=40)
 assert resp.status_code==206 and resp.content==src.open('rb').read(32),key
 print('PRIVATE_ACCESS_OK',key,flush=True)
manifest={'slug':META['slug'],'readyForCheckout':True,'pdfPages':49,'questions':160,'language':'pt-BR','summaryAndChapters':9,'assets':rows}
key=META['slug']+'/audio/manifest.json'
raw=json.dumps(manifest,ensure_ascii=False,sort_keys=True).encode()
digest=hashlib.sha256(raw).hexdigest()
try:
 old=client.get_object(Bucket=bucket,Key=key)['Body'].read()
 assert old==raw,'Different manifest exists; refusing overwrite'
except ClientError as e:
 if e.response.get('ResponseMetadata',{}).get('HTTPStatusCode')!=404:raise
 client.put_object(Bucket=bucket,Key=key,Body=raw,ContentType='application/json',CacheControl='private, no-store',Metadata={'sha256':digest})
assert client.head_object(Bucket=bucket,Key=key)['Metadata']['sha256']==digest
print('R2_ALL_11_ASSETS_VERIFIED_AND_PRIVATE',flush=True)
