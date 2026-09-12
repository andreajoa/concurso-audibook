"""Copy into product-specific R2 folders and verify every byte. Never delete old links."""
import hashlib
import json
import os
from pathlib import Path
import boto3
from botocore.config import Config

bucket = os.environ.get('R2_BUCKET', 'apostila')
s3 = boto3.client('s3', endpoint_url=f'https://{os.environ["R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
    region_name='auto', aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'], config=Config(signature_version='s3v4'))
rows = json.loads(Path('products/media-migration.json').read_text())
for row in rows:
    source, target = row['source'], row['target']
    if source != target:
        s3.copy_object(Bucket=bucket, Key=target, CopySource={'Bucket': bucket, 'Key': source})
    def fingerprint(key):
        digest = hashlib.sha256()
        body = s3.get_object(Bucket=bucket, Key=key)['Body']
        for chunk in body.iter_chunks(chunk_size=1024*1024):
            digest.update(chunk)
        body.close()
        return digest.digest()
    if fingerprint(source) != fingerprint(target):
        raise RuntimeError(f'Copy verification failed: {target}')
    print(f'PASS verified copy: {target}', flush=True)

# Preserve the original generation record and add a manifest for the organized paths.
slug = 'redacao-nivel-fundamental-2026'
manifest = json.loads(s3.get_object(Bucket=bucket, Key=f'{slug}/audiobook-manifest-pt-br-v1.json')['Body'].read())
mapping = {r['source']: r['target'] for r in rows}
for field in ['pdfKey','coverKey','summaryKey']:
    manifest[field] = mapping[manifest[field]]
for chapter in manifest['chapters']:
    chapter['key'] = mapping[chapter['key']]
s3.put_object(Bucket=bucket, Key=f'{slug}/audio/manifest.json',
    Body=json.dumps(manifest,ensure_ascii=False).encode(), ContentType='application/json',
    CacheControl='private, no-store')
print('PASS: separate product folders ready; existing files preserved.')
