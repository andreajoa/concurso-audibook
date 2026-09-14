#!/usr/bin/env python3
"""Read-only audit of private study media. Never publish source files or signed URLs."""
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

import boto3
import requests
from botocore.config import Config
from pypdf import PdfReader


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    catalog = json.loads(Path('products/catalog.json').read_text())
    santos_sources = json.loads(Path('products/santos-media-sources.json').read_text())
    bucket = os.environ.get('R2_BUCKET', 'apostila')
    account = os.environ['R2_ACCOUNT_ID']
    s3 = boto3.client('s3', endpoint_url=f'https://{account}.r2.cloudflarestorage.com',
        region_name='auto', aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        config=Config(signature_version='s3v4', retries={'max_attempts': 3}))
    fingerprints = {}
    report = []
    with tempfile.TemporaryDirectory(prefix='study-media-audit-') as directory:
        work = Path(directory)
        for slug, product in catalog.items():
            if not product.get('active'):
                continue
            assets = product['assets']
            tracks = [assets['summary'], *assets['chapters']]
            require(len(tracks) == 9, f'{slug}: expected summary and eight chapters')
            require(len({t['key'] for t in tracks}) == 9, f'{slug}: repeated audio keys')
            pdf = work / 'source.pdf'
            s3.download_file(bucket, assets['pdfKey'], str(pdf))
            pages = [page.extract_text() or '' for page in PdfReader(pdf).pages]
            source = santos_sources.get(slug)
            # The supplied Santos editions have an image-only first page.
            readable_pages = pages[1:] if source else pages
            require(all(p.strip() for p in readable_pages), f'{slug}: unreadable PDF content pages')
            expected = source['pageCount'] if source else (19 if slug == 'redacao-nivel-fundamental-2026' else 34)
            require(len(pages) == expected, f'{slug}: unexpected PDF page count')
            body = '\n'.join(pages).lower()
            if source:
                topics = ['agente de portaria' if slug.startswith('agente-') else 'inspetor de alunos', 'ibam', 'gabarito']
                require(hashlib.sha256(pdf.read_bytes()).hexdigest() == source['pdfSha256'], f'{slug}: PDF differs from supplied source')
                cover = work / 'cover.png'
                s3.download_file(bucket, assets['coverKey'], str(cover))
                require(hashlib.sha256(cover.read_bytes()).hexdigest() == source['coverSha256'], f'{slug}: cover differs from supplied source')
            else:
                topics = ['redação', 'dissertação', 'gabarito'] if expected == 19 else ['autores', 'ibam', 'gabarito']
            require(all(word in body for word in topics), f'{slug}: PDF subject does not match product')
            manifest = None
            santos_tracks = {}
            if source:
                record = json.loads(s3.get_object(Bucket=bucket, Key=f'{slug}/audio/manifest.json')['Body'].read())
                require(record['slug'] == slug and record['pdfSha256'] == source['pdfSha256'], f'{slug}: manifest source mismatch')
                santos_tracks = {track['key']: track for track in record['chapters']}
                require(len(record['chapters']) == 9 and set(santos_tracks) == {track['key'] for track in tracks}, f'{slug}: manifest track mapping mismatch')
                require(santos_tracks[assets['summary']['key']]['pages'] == source['summaryPages'], f'{slug}: manifest summary pages differ from source')
                require(all(santos_tracks[track['key']]['id'] == track['id'] for track in tracks), f'{slug}: manifest track IDs differ from catalog')
                ranges = [santos_tracks[chapter['key']]['pages'] for chapter in assets['chapters']]
                require(ranges == source['chapters'], f'{slug}: manifest chapter pages differ from source')
                covered = [page for first, last in ranges for page in range(first, last + 1)]
                require(covered == list(range(2, expected + 1)), f'{slug}: missing, repeated or unordered source pages')
            if expected == 19:
                manifest = json.loads(s3.get_object(Bucket=bucket,
                    Key=f'{slug}/audio/manifest.json')['Body'].read())
                require(manifest['pdfKey'] == assets['pdfKey'], 'Redacao manifest: wrong PDF')
                require(manifest['summaryKey'] == assets['summary']['key'], 'Redacao manifest: wrong summary')
                require([c['key'] for c in manifest['chapters']] == [c['key'] for c in assets['chapters']],
                    'Redacao manifest: chapter mapping mismatch')
                covered = [p for c in manifest['chapters'] for p in range(c['pages'][0], c['pages'][1]+1)]
                require(covered == list(range(1, 20)), 'Redacao: missing, repeated or unordered source pages')
            durations = []
            for index, track in enumerate(tracks):
                media = work / 'track.mp3'
                s3.download_file(bucket, track['key'], str(media))
                digest = hashlib.sha256(media.read_bytes()).hexdigest()
                if source:
                    require(digest == santos_tracks[track['key']]['sha256'], f'{slug}/{track["id"]}: audio differs from completion manifest')
                require(digest not in fingerprints, f'{slug}/{track["id"]}: duplicate audio content')
                fingerprints[digest] = (slug, track['id'])
                probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                    'format=duration:stream=codec_name', '-of', 'json', str(media)],
                    check=True, capture_output=True, text=True, timeout=60)
                info = json.loads(probe.stdout)
                seconds = float(info['format']['duration'])
                require(seconds > 10, f'{slug}/{track["id"]}: audio too short')
                if source:
                    require(abs(seconds - santos_tracks[track['key']]['durationSeconds']) < 0.1,
                        f'{slug}/{track["id"]}: duration differs from completion manifest')
                require(any(s.get('codec_name') == 'mp3' for s in info['streams']),
                    f'{slug}/{track["id"]}: expected MP3 audio')
                decoded = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(media),
                    '-f', 'null', '-'], capture_output=True, timeout=180)
                require(decoded.returncode == 0, f'{slug}/{track["id"]}: audio decoding failed')
                if manifest and index:
                    require(media.stat().st_size == manifest['chapters'][index-1]['bytes'],
                        f'{slug}/{track["id"]}: generated file size differs from manifest')
                url = s3.generate_presigned_url('get_object', Params={'Bucket': bucket,
                    'Key': track['key']}, ExpiresIn=120)
                with requests.get(url, headers={'Range': 'bytes=0-31'}, timeout=30) as response:
                    with media.open('rb') as audio_file:
                        expected_prefix = audio_file.read(32)
                    require(response.status_code == 206 and response.content == expected_prefix,
                        f'{slug}/{track["id"]}: signed streaming range failed')
                durations.append(round(seconds, 2))
                print(f'PASS {slug}/{track["id"]}: MP3 decoded; signed streaming; {seconds:.1f}s', flush=True)
            report.append({'slug': slug, 'pdf_pages': len(pages), 'summary_seconds': durations[0],
                'chapter_seconds': durations[1:], 'total_seconds': round(sum(durations), 2)})
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print('PASS: distinct product audio; all files decoded; summary and chapters available privately.')


if __name__ == '__main__':
    main()
