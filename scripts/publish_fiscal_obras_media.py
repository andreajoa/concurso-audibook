#!/usr/bin/env python3
"""Validate the new Fiscal de Obras package using SHA-256 and MP3/PDF checks."""
import json,hashlib,subprocess,sys
from pathlib import Path
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]
META=json.loads((ROOT/'products/matao-fiscal-obras-2026-media.json').read_text())
PRODUCT=json.loads((ROOT/'products/catalog.json').read_text())[META['slug']]
def checksum(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for buf in iter(lambda:f.read(1024*1024),b''):h.update(buf)
 return h.hexdigest()
def validate(directory):
 rows=META['files']
 assert len(rows)==11 and len({x['key'] for x in rows})==11
 keys={PRODUCT['assets']['coverKey'],PRODUCT['assets']['pdfKey'],PRODUCT['assets']['summary']['key'],*[x['key'] for x in PRODUCT['assets']['chapters']]}
 assert keys=={r['key'] for r in rows}
 for row in rows:
  path=directory/row['file']
  assert path.is_file() and path.stat().st_size==row['bytes'],row['file']
  assert checksum(path)==row['sha256'],row['file']
  if row['contentType']=='application/pdf':
   d=PdfReader(path)
   assert len(d.pages)==49
   text=' '.join(p.extract_text() or '' for p in d.pages)
   assert 'Gabaritos comentados' in text and 'Simulado 2' in text
  elif row['contentType']=='audio/mpeg':
   duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],text=True))
   assert duration>=60 and abs(duration-row['durationSeconds'])<0.5
   subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(path),'-f','null','-'],capture_output=True,check=True)
  elif row['contentType']=='image/png':
   assert path.open("rb").read(8)==bytes.fromhex("89504e470d0a1a0a")
  else:raise RuntimeError('Unexpected MIME')
  print('VERIFIED',row['file'],flush=True)
 return rows
if __name__=='__main__':
 directory=Path(sys.argv[1])
 validate(directory)
 print('READY_FOR_PRIVATE_STORAGE',flush=True)
