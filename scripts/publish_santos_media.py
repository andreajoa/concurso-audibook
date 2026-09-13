#!/usr/bin/env python3
"""Publish the supplied Santos PDFs/covers and source-grounded pt-BR audio to private R2."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import wave
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCES = json.loads((ROOT / 'products/santos-media-sources.json').read_text())
CATALOG = json.loads((ROOT / 'products/catalog.json').read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def clean(text):
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('@neuromargarethapoio'):
            continue
        if 'IBAM' in line and 'SANTOS 2026' in line and '•' in line:
            continue
        lines.append(line)
    text = '\n'.join(lines).replace('\u00a0', ' ')
    for old, new in [('', ''), ('•', '; '), ('→', '; '), ('×', ' vezes '), ('÷', ' dividido por '), ('=', ' igual a '), ('%', ' por cento'), ('R$', ' reais ')]:
        text = text.replace(old, new)
    text = re.sub(r'(?m)^([ABCD])\)\s*', r'Alternativa \1: ', text)
    text = re.sub(r'\bIBAM\b', 'Ibam', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


def prepare(slug, source_dir):
    spec, product = SOURCES[slug], CATALOG[slug]
    pdf, cover = source_dir / spec['pdfFile'], source_dir / spec['coverFile']
    for file, expected in [(pdf, spec['pdfSha256']), (cover, spec['coverSha256'])]:
        if digest(file.read_bytes()) != expected:
            raise RuntimeError(f'Source checksum mismatch: {file.name}')
    if not cover.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):
        raise RuntimeError('Cover must be a PNG')
    pages = [page.extract_text() or '' for page in PdfReader(pdf).pages]
    if len(pages) != spec['pageCount'] or any(not p.strip() for p in pages[1:]):
        raise RuntimeError(f'Expected {spec["pageCount"]} pages and readable text after the cover')
    ranges = spec['chapters']
    covered = [p for first, last in ranges for p in range(first, last + 1)]
    if covered != list(range(2, len(pages) + 1)) or len(ranges) != len(product['assets']['chapters']):
        raise RuntimeError('Chapter ranges must cover the entire PDF after its image cover exactly once')
    tracks = []
    for number, (chapter, (first, last)) in enumerate(zip(product['assets']['chapters'], ranges), 1):
        body = clean('\n'.join(pages[first - 1:last]))
        if len(body) < 500:
            raise RuntimeError(f'Chapter {number} has insufficient source text')
        text = f'Trilha Aprova. {product["shortName"]}. Capítulo {number}: {chapter["title"]}.\n\n{body}\n\nFim deste capítulo.'
        tracks.append({**chapter, 'text': text, 'pages': [first, last]})
    first, last = spec['summaryPages']
    summary = clean('\n'.join(pages[first - 1:last]))
    tracks.append({**product['assets']['summary'], 'text': f'Trilha Aprova. {product["shortName"]}. Resumo: raio X da prova. As informações a seguir são da apostila fornecida; confirme eventuais atualizações no edital oficial.\n\n{summary}\n\nFim do resumo.', 'pages': [first, last]})
    return pdf, cover, tracks


def audio_details(file):
    info = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(file)], capture_output=True, check=True, text=True)
    duration = float(json.loads(info.stdout)['format']['duration'])
    if duration < 10:
        raise RuntimeError(f'Audio unexpectedly short: {file.name}')
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(file), '-f', 'null', '-'], capture_output=True, check=True)
    return round(duration, 2)


def publish(slug, source_dir):
    import generate_audiobook as base
    import requests
    from botocore.exceptions import ClientError
    from piper import PiperVoice

    pdf, cover, tracks = prepare(slug, source_dir)
    product, spec = CATALOG[slug], SOURCES[slug]
    s3 = base.r2_client()

    def head(key):
        try:
            return s3.head_object(Bucket=base.BUCKET, Key=key)
        except ClientError as error:
            if error.response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 404:
                return None
            raise

    def remote_hash(key):
        result = s3.get_object(Bucket=base.BUCKET, Key=key)
        value = hashlib.sha256()
        try:
            for chunk in result['Body'].iter_chunks(chunk_size=1024 * 1024):
                value.update(chunk)
        finally:
            result['Body'].close()
        return value.hexdigest()

    def upload(file, key, content_type, metadata=None):
        checksum = digest(file.read_bytes())
        existing = head(key)
        if existing and remote_hash(key) != checksum:
            raise RuntimeError(f'Refusing to overwrite different existing material: {key}')
        if not existing:
            s3.upload_file(str(file), base.BUCKET, key, ExtraArgs={'ContentType': content_type, 'CacheControl': 'private, no-store', 'Metadata': {'sha256': checksum, **(metadata or {})}})
        if remote_hash(key) != checksum:
            raise RuntimeError(f'R2 byte verification failed: {key}')
        print(f'VERIFIED {key} ({file.stat().st_size} bytes)', flush=True)
        return checksum

    upload(pdf, product['assets']['pdfKey'], 'application/pdf')
    upload(cover, product['assets']['coverKey'], 'image/png')
    manifest = {'slug': slug, 'voice': base.VOICE_NAME, 'language': 'pt-BR', 'pdfSha256': spec['pdfSha256'], 'chapters': []}
    with tempfile.TemporaryDirectory(prefix='santos-media-') as tmp:
        work = Path(tmp)
        voice = None
        for track in tracks:
            key = track['key']
            fingerprint = digest((base.VOICE_NAME + '\n' + spec['pdfSha256'] + '\n' + track['text']).encode())
            output = work / (track['id'] + '.mp3')
            existing = head(key)
            if existing:
                if existing.get('Metadata', {}).get('source-sha256') != fingerprint:
                    raise RuntimeError(f'Existing audio has unverified provenance: {key}')
                s3.download_file(base.BUCKET, key, str(output))
                if digest(output.read_bytes()) != existing.get('Metadata', {}).get('sha256'):
                    raise RuntimeError(f'Existing audio checksum mismatch: {key}')
                duration = audio_details(output)
                checksum = digest(output.read_bytes())
                print(f'RESUMED {key}', flush=True)
            else:
                if voice is None:
                    voice = PiperVoice.load(str(base.ensure_voice(work)))
                parts = []
                chunks = base.chunk_text(track['text'])
                for index, chunk in enumerate(chunks):
                    wav = work / f'{track["id"]}-{index:03d}.wav'
                    with wave.open(str(wav), 'wb') as stream:
                        voice.synthesize_wav(chunk, stream)
                    parts.append(wav)
                    if index % 10 == 0:
                        print(f'TTS {slug} {track["id"]}: {index + 1}/{len(chunks)} chunks', flush=True)
                base.join_audio(parts, output)
                duration = audio_details(output)
                # Catch severe truncation/silence relative to the amount of spoken source text.
                words_per_second = len(track['text'].split()) / duration
                if not 0.5 <= words_per_second <= 5:
                    raise RuntimeError(f'Implausible speech duration for {track["id"]}')
                checksum = upload(output, key, 'audio/mpeg', {'source-sha256': fingerprint})
                for wav in parts:
                    wav.unlink()
            url = s3.generate_presigned_url('get_object', Params={'Bucket': base.BUCKET, 'Key': key}, ExpiresIn=120)
            response = requests.get(url, headers={'Range': 'bytes=0-31'}, timeout=30)
            if response.status_code != 206 or len(response.content) != 32:
                raise RuntimeError(f'Private streaming failed: {key}')
            manifest['chapters'].append({'id': track['id'], 'key': key, 'pages': track['pages'], 'durationSeconds': duration, 'sha256': checksum, 'sourceSha256': fingerprint})
            print(f'AUDIO VERIFIED {track["id"]}: {duration}s; private byte range OK', flush=True)
        # Write completion record only after every source and track is verified.
        s3.put_object(Bucket=base.BUCKET, Key=f'{slug}/audio/manifest.json', Body=json.dumps(manifest, ensure_ascii=False).encode(), ContentType='application/json', CacheControl='private, no-store')
    print(f'COMPLETE {slug}: PDF, cover and {len(tracks)} audio tracks verified', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--slug', required=True, choices=SOURCES)
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    if args.validate_only:
        _, _, tracks = prepare(args.slug, args.source_dir)
        for track in tracks:
            print(json.dumps({'id': track['id'], 'pages': track['pages'], 'characters': len(track['text'])}))
        print(f'VALIDATED {args.slug}: source checksums, full page coverage, {len(tracks)} tracks')
    else:
        publish(args.slug, args.source_dir)


if __name__ == '__main__':
    main()
