#!/usr/bin/env python3
"""Validate the Aparecida PE-I Pedagogia 2026 package (SHA-256, PDF pages, MP3 decode) before private storage."""
import json,hashlib,subprocess,sys
from pathlib import Path
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]
META=json.loads((ROOT/'products/aparecida-pe1-2026-media.json').read_text())
PRODUCT=json.loads((ROOT/'products/aparecida-pe1-2026-product-staged.json').read_text())
def checksum(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for buf in iter(lambda:f.read(1024*1024),b''):h.update(buf)
 return h.hexdigest()
def validate(directory):
 rows=META['files']
 assert len(rows)==11 and len({x['key'] for x in rows})==11
 a=PRODUCT['assets']
 keys={a['coverKey'],a['pdfKey'],a['summary']['key'],*[x['key'] for x in a['chapters']]}
 assert keys=={r['key'] for r in rows}
 for row in rows:
  path=directory/row['file']
  assert path.is_file() and path.stat().st_size==row['bytes'],row['file']
  assert checksum(path)==row['sha256'],row['file']
  if row['contentType']=='application/pdf':
   d=PdfReader(path)
   assert len(d.pages)==META['pdfPages']
   text=' '.join((d.pages[i].extract_text() or '') for i in range(0,90))
   assert 'Gabaritos e comentários' in text and 'Simulado' in text and 'Aparecida de Goiânia' in text
  elif row['contentType']=='audio/mpeg':
   duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(path)],text=True))
   assert duration>=60 and abs(duration-row['durationSeconds'])<0.5
   subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(path),'-f','null','-'],capture_output=True,check=True)
  elif row['contentType']=='image/png':
   assert path.open('rb').read(8)==bytes.fromhex('89504e470d0a1a0a')
  else:raise RuntimeError('Unexpected MIME')
  print('VERIFIED',row['file'],flush=True)
 return rows
if __name__=='__main__':
 validate(Path(sys.argv[1]))
 print('READY_FOR_PRIVATE_STORAGE',flush=True)
