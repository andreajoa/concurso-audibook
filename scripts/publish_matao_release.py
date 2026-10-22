#!/usr/bin/env python3
"""Publish owner-approved Matão media staged in a *draft* GitHub release.

Public repo contains only metadata and this script. Paid PDF/recordings are
downloaded by the authorized GitHub Actions runner from a draft-only release,
checked locally, and uploaded to the private R2 bucket, never public storage.

Activation of checkout is a separate, explicit post-verification change.
"""
from __future__ import annotations
import argparse,hashlib,json,os,subprocess,sys
from pathlib import Path
import boto3
import requests
from botocore.config import Config
from botocore.exceptions import ClientError
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parent.parent
ASSETS=Path(os.environ.get('MATAO_RELEASE_ASSETS','/tmp/matao-release'))
BASE='matao-sp-assistente-administrativo-2026'
PREFIX=BASE+'/'
M=json.loads((ROOT/'products/matao-2026-final-media.json').read_text())
CHAPTERS=['01-antes-de-comecar-raio-x','02-portugues','03-matematica','04-informatica','05-legislacao','06-conhecimentos-especificos','07-questoes-simulados','08-gabarito-revisao']
R2_ENDPOINT='https://dbad4dc0550693a69d5956df7344e001.r2.cloudflarestorage.com'
BUCKET='apostila'
PDF_KEY=PREFIX+'docs/apostila-matao-sp-assistente-administrativo-2026.pdf'
COVER_KEY=PREFIX+'images/capa.png'
SUMMARY_KEY=PREFIX+'audio/resumo.mp3'
AUDIO_KEYS=[PREFIX+'audio/pt-br-v1/'+n+'.mp3' for n in CHAPTERS]

def digest(filename):
 h=hashlib.sha256()
 with open(filename,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

def load_private_source():
 files={}
 for what,item in M['files'].items():
  p=ASSETS/item['name']
  if not p.is_file():raise RuntimeError('Missing draft release asset: '+item['name'])
  if digest(p)!=item['sha256']:raise RuntimeError('Checksum mismatch: '+what)
  files[what]=p
 reader=PdfReader(files['pdf'])
 if len(reader.pages)!=M['pdfPages'] or len(reader.pages)<40:raise RuntimeError('PDF page count mismatch')
 all_text='\n'.join(p.extract_text() or '' for p in reader.pages)
 if 'NÃO COMERCIALIZAR' in all_text.upper():raise RuntimeError('Preview marker remains')
 for token in ['CAPÍTULO 1','CAPÍTULO 2','CAPÍTULO 3','CAPÍTULO 4','CAPÍTULO 5','CAPÍTULO 6','CAPÍTULO 7','CAPÍTULO 8','SIMULADO 1','SIMULADO 2']:
  if token not in all_text:raise RuntimeError('Missing PDF section '+token)
 data=json.loads(files['script'].read_text())
 if len(data['sections'])!=8 or data['statistics']['total']!=160:raise RuntimeError('Audio script incomplete')
 if data['language']!='pt-BR':raise RuntimeError('Audio language mismatch')
 if not files['cover'].read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):raise RuntimeError('Invalid cover PNG')
 print('SOURCE_OK',len(reader.pages),'pages, 160 original exercises, 8 audio chapters, verified cover',flush=True)
 return files,data

def cloud():
 return boto3.client('s3',endpoint_url=R2_ENDPOINT,aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
  aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],region_name='auto',
  config=Config(signature_version='s3v4',retries={'max_attempts':5,'mode':'standard'}))

def head(c,key):
 try:return c.head_object(Bucket=BUCKET,Key=key)
 except ClientError as e:
  if e.response.get('ResponseMetadata',{}).get('HTTPStatusCode') in [403,404]:return None
  raise

def upload(c,path,key,ctype):
 expected=digest(path)
 h=head(c,key)
 if h:
  if h.get('Metadata',{}).get('sha256')!=expected or int(h.get('ContentLength',0))!=path.stat().st_size:
   raise RuntimeError('Different existing private object; refusing overwrite '+key)
  print('ALREADY_IN_R2',key,flush=True)
 else:
  c.upload_file(str(path),BUCKET,key,ExtraArgs={
   'ContentType':ctype,'CacheControl':'private, no-store',
   'Metadata':{'sha256':expected}})
  print('UPLOADED_R2',key,path.stat().st_size,flush=True)
 verified=head(c,key)
 if not verified or verified['ContentLength']!=path.stat().st_size or verified.get('Metadata',{}).get('sha256')!=expected:
  raise RuntimeError('R2 head verification failed: '+key)
 return expected

def range_check(c,key):
 url=c.generate_presigned_url('get_object',Params={'Bucket':BUCKET,'Key':key},ExpiresIn=120)
 resp=requests.get(url,headers={'Range':'bytes=0-31'},timeout=35)
 if resp.status_code!=206 or len(resp.content)!=32:raise RuntimeError('R2 signed access/range test failed for '+key)

def source_stage():
 files,_=load_private_source()
 c=cloud()
 upload(c,files['pdf'],PDF_KEY,'application/pdf')
 upload(c,files['cover'],COVER_KEY,'image/png')
 range_check(c,PDF_KEY);range_check(c,COVER_KEY)
 print('PRIVATE_SOURCES_READY; checkout remains disabled',flush=True)

def final_stage():
 files,data=load_private_source()
 c=cloud()
 if not head(c,PDF_KEY) or not head(c,COVER_KEY):raise RuntimeError('Run source upload first')
 for key in [PDF_KEY,COVER_KEY]:range_check(c,key)
 recording_paths=[ASSETS/'resumo.mp3']+[ASSETS/(n+'.mp3') for n in CHAPTERS]
 for i,(p,key) in enumerate(zip(recording_paths,[SUMMARY_KEY]+AUDIO_KEYS)):
  if not p.is_file():raise RuntimeError('Missing recording '+p.name)
  if p.stat().st_size<20000 or p.suffix!='.mp3':raise RuntimeError('Bad MP3 file '+p.name)
  raw=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)],capture_output=True,text=True,check=True)
  seconds=float(raw.stdout.strip())
  if seconds<55:raise RuntimeError('Audio too short '+p.name)
  if i>0:
   wc=data['sections'][i-1]['wordCount']
   rate=wc/seconds
   if not .40<rate<5.5:raise RuntimeError('Unreasonable words/second '+p.name)
  subprocess.run(['ffmpeg','-hide_banner','-v','error','-xerror','-i',str(p),'-f','null','-'],capture_output=True,check=True)
  upload(c,p,key,'audio/mpeg')
  range_check(c,key)
  print('RECORDING_OK',p.name,'duration',round(seconds,1),'s',flush=True)
 manifest={'slug':BASE,'readyForCheckout':True,'language':'pt-BR','voice':'Luciana (macOS pt_BR)','sourceDate':'2026-10-21',
  'pages':M['pdfPages'],'questions':160,'chapters':8,'PDF':PDF_KEY,'cover':COVER_KEY,
  'summary':SUMMARY_KEY,'chapterKeys':AUDIO_KEYS,'completeAssetsVerified':11}
 key=PREFIX+'audio/manifest.json'
 content=json.dumps(manifest,ensure_ascii=False,sort_keys=True).encode()
 existing=head(c,key)
 if existing:raise RuntimeError('Existing manifest; refusing overwrite')
 c.put_object(Bucket=BUCKET,Key=key,Body=content,ContentType='application/json',
   CacheControl='private, no-store',Metadata={'sha256':hashlib.sha256(content).hexdigest()})
 range_check(c,key)
 print('ALL_ASSETS_VERIFIED_AND_PRIVATE; checkout can now be activated separately',flush=True)

if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('stage',choices=['sources','finalize'])
 args=ap.parse_args()
 (source_stage if args.stage=='sources' else final_stage)()
