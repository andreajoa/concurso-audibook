#!/usr/bin/env python3
"""Publish the supplied DETRAN-SP 2026 (Agente Estadual de Trânsito) material privately, with resumable chapter jobs.

Same pipeline as publish_peif_media.py; only the product, its running header/footer and the spoken intro differ."""
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
SLUG = 'detran-sp-agente-de-transito-2026'
SPEC_PATH = ROOT / 'products/detran-sp-2026-source.json'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def configuration():
    return json.loads(SPEC_PATH.read_text()), json.loads((ROOT / 'products/catalog.json').read_text())[SLUG]


def clean(text):
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if line == 'TRILHA APROVA CONCURSOS' or re.fullmatch(r'\d+\s*/\s*49', line):
            continue
        if line.startswith(('DETRAN-SP 2026 - Agente Estadual de Trânsito', 'AGENTE ESTADUAL DE TRÂNSITO - DETRAN-SP 2026', 'TRILHA APROVA CONCURSOS ')):
            continue
        lines.append(line)
    text = '\n'.join(lines).replace('\u00a0', ' ')
    for old, new in [('•', '; '), ('→', '; '), ('×', ' vezes '), ('÷', ' dividido por '), ('%', ' por cento'), ('R$', ' reais ')]:
        text = text.replace(old, new)
    text = re.sub(r'(?m)^\(?([ABCDE])\)\s*', r'Alternativa \1: ', text)
    text = re.sub(r'\bCTB\b', 'C T B', text)
    return re.sub(r'[ \t]+', ' ', text).strip()


def prepare_texts(pdf):
    spec, product = configuration()
    require(digest(pdf.read_bytes()) == spec['pdfSha256'], 'PDF differs from supplied original')
    pages = [p.extract_text() or '' for p in PdfReader(pdf).pages]
    require(len(pages) == spec['pageCount'], 'Unexpected PDF page count')
    require(all(p.strip() for p in pages), 'An original page has no extractable text')
    ranges = spec['chapters']
    covered = [p for start, end in ranges for p in range(start, end + 1)]
    require(covered == list(range(1, len(pages) + 1)), 'Chapter ranges must cover every source page once, in order')
    require(len(ranges) == len(product['assets']['chapters']) == 8, 'Exactly eight chapters are required')
    tracks = []
    for number, (track, (start, end)) in enumerate(zip(product['assets']['chapters'], ranges), 1):
        body = '\n\n'.join(clean(p) for p in pages[start - 1:end])
        require(len(body.split()) >= 500, 'Insufficient chapter source text')
        text = f'Trilha Aprova. DETRAN São Paulo 2026, Agente Estadual de Trânsito. Capítulo {number}: {track["title"]}.\n\n{body}\n\nFim deste capítulo.'
        tracks.append({**track, 'text': text, 'pages': [start, end]})
    return tracks


def audio_details(file):
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_name', '-of', 'json', str(file)], check=True, capture_output=True, text=True, timeout=60)
    info = json.loads(probe.stdout)
    seconds = float(info['format']['duration'])
    require(seconds > 10, 'Audio unexpectedly short')
    require(any(s.get('codec_name') == 'mp3' for s in info['streams']), 'Expected MP3 audio')
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(file), '-f', 'null', '-'], check=True, capture_output=True, timeout=600)
    return round(seconds, 3)


def speech_chunks(text, chunker):
    # Writing lines on the notes pages have no phonemes. Piper returns no audio
    # for an underscore-only chunk; never submit those as speech.
    spoken = re.sub(r'_{3,}', ' ', text)
    chunks = [chunk for chunk in chunker(spoken) if re.search(r'[^\W_]', chunk)]
    letters = lambda value: ''.join(re.findall(r'[^\W_]', value))
    require(letters(text) == letters(' '.join(chunks)), 'Speech chunking lost source letters or numbers')
    require(bool(chunks), 'No narratable source content')
    return chunks


class Store:
    def __init__(self):
        import generate_audiobook as base
        self.client, self.bucket = base.r2_client(), base.BUCKET

    def head(self, key):
        from botocore.exceptions import ClientError
        try:
            return self.client.head_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            if error.response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 404:
                return None
            raise

    def hash(self, key):
        body = self.client.get_object(Bucket=self.bucket, Key=key)['Body']
        sha = hashlib.sha256()
        try:
            for chunk in body.iter_chunks(chunk_size=1024 * 1024):
                sha.update(chunk)
        finally:
            body.close()
        return sha.hexdigest()

    def upload(self, file, key, content_type, fingerprint=None):
        sha = digest(file.read_bytes())
        existing = self.head(key)
        if existing:
            require(self.hash(key) == sha, f'Refusing to overwrite different existing object: {key}')
            if fingerprint:
                require(existing.get('Metadata', {}).get('source-sha256') == fingerprint, 'Existing source fingerprint differs')
        else:
            metadata = {'sha256': sha}
            if fingerprint:
                metadata['source-sha256'] = fingerprint
            self.client.upload_file(str(file), self.bucket, key, ExtraArgs={'ContentType': content_type, 'CacheControl': 'private, no-store', 'Metadata': metadata})
        require(self.hash(key) == sha, 'R2 byte verification failed')
        self.range(key, file.read_bytes()[:32])
        print(f'VERIFIED {key}: {file.stat().st_size} bytes', flush=True)
        return sha

    def range(self, key, expected):
        import requests
        url = self.client.generate_presigned_url('get_object', Params={'Bucket': self.bucket, 'Key': key}, ExpiresIn=120)
        response = requests.get(url, headers={'Range': 'bytes=0-31'}, timeout=45)
        require(response.status_code == 206 and response.content == expected, f'Private streaming failed: {key}')

    def record(self, key, row):
        self.client.put_object(Bucket=self.bucket, Key=key, Body=json.dumps(row, ensure_ascii=False).encode(), ContentType='application/json', CacheControl='private, no-store')

    def read_record(self, key):
        body = self.client.get_object(Bucket=self.bucket, Key=key)['Body']
        try:
            return json.loads(body.read())
        finally:
            body.close()


def validate_sources(source_dir):
    spec, product = configuration()
    for filename, checksum in [('pdfFile', 'pdfSha256'), ('coverFile', 'coverSha256'), ('summaryFile', 'summarySourceSha256')]:
        require(digest((source_dir / spec[filename]).read_bytes()) == spec[checksum], f'Source checksum mismatch: {filename}')
    require((source_dir / spec['coverFile']).read_bytes().startswith(b'\x89PNG\r\n\x1a\n'), 'Expected PNG cover')
    tracks = prepare_texts(source_dir / spec['pdfFile'])
    return tracks


def publish_sources(source_dir):
    spec, product = configuration()
    validate_sources(source_dir)
    store = Store()
    store.upload(source_dir / spec['pdfFile'], product['assets']['pdfKey'], 'application/pdf')
    store.upload(source_dir / spec['coverFile'], product['assets']['coverKey'], 'image/png')
    with tempfile.TemporaryDirectory(prefix='detran-summary-') as tmp:
        mp3 = Path(tmp) / 'resumo.mp3'
        source = source_dir / spec['summaryFile']
        subprocess.run(['ffmpeg', '-hide_banner', '-v', 'error', '-i', str(source), '-map', '0:a:0', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', str(mp3)], check=True)
        seconds = audio_details(mp3)
        require(abs(seconds - spec['summaryDurationSeconds']) < 0.2, 'Summary duration differs from supplied audio')
        fingerprint = digest((spec['summarySourceSha256'] + '\nmp3-128k-stereo-44100-v1').encode())
        sha = store.upload(mp3, product['assets']['summary']['key'], 'audio/mpeg', fingerprint)
        store.record(f'{SLUG}/audio/summary-record.json', {'id': 'summary', 'key': product['assets']['summary']['key'], 'durationSeconds': seconds, 'sha256': sha, 'sourceSha256': fingerprint, 'originalSha256': spec['summarySourceSha256']})


def publish_chapter(number):
    import generate_audiobook as base
    from piper import PiperVoice
    spec, product = configuration()
    require(1 <= number <= 8, 'Invalid chapter number')
    store = Store()
    with tempfile.TemporaryDirectory(prefix='detran-chapter-') as tmp:
        work = Path(tmp)
        pdf = work / 'original.pdf'
        store.client.download_file(store.bucket, product['assets']['pdfKey'], str(pdf))
        track = prepare_texts(pdf)[number - 1]
        fingerprint = digest((base.VOICE_NAME + '\n' + spec['pdfSha256'] + '\n' + track['text']).encode())
        mp3 = work / 'chapter.mp3'
        existing = store.head(track['key'])
        if existing:
            require(existing.get('Metadata', {}).get('source-sha256') == fingerprint, 'Existing audio has different source')
            store.client.download_file(store.bucket, track['key'], str(mp3))
            sha = digest(mp3.read_bytes())
            require(sha == existing.get('Metadata', {}).get('sha256'), 'Stored audio checksum mismatch')
            seconds = audio_details(mp3)
            store.range(track['key'], mp3.read_bytes()[:32])
        else:
            voice = PiperVoice.load(str(base.ensure_voice(work)))
            chunks = speech_chunks(track['text'], base.chunk_text)
            parts = []
            for index, chunk in enumerate(chunks):
                wav = work / f'{index:04d}.wav'
                with wave.open(str(wav), 'wb') as stream:
                    voice.synthesize_wav(chunk, stream)
                parts.append(wav)
                if index % 5 == 0:
                    print(f'TTS chapter {number}: {index + 1}/{len(chunks)}', flush=True)
            base.join_audio(parts, mp3)
            seconds = audio_details(mp3)
            require(0.5 <= len(track['text'].split()) / seconds <= 5, 'Implausible speech duration')
            sha = store.upload(mp3, track['key'], 'audio/mpeg', fingerprint)
        store.record(f'{SLUG}/audio/chapter-{number}-record.json', {'id': track['id'], 'key': track['key'], 'pages': track['pages'], 'durationSeconds': seconds, 'sha256': sha, 'sourceSha256': fingerprint, 'words': len(track['text'].split())})
        print(f'COMPLETE chapter {number}: {seconds}s, pages {track["pages"]}', flush=True)


def finalize():
    import generate_audiobook as base
    spec, product = configuration()
    store = Store()
    require(store.hash(product['assets']['pdfKey']) == spec['pdfSha256'], 'Published PDF source mismatch')
    require(store.hash(product['assets']['coverKey']) == spec['coverSha256'], 'Published cover mismatch')
    summary = store.read_record(f'{SLUG}/audio/summary-record.json')
    require(summary['originalSha256'] == spec['summarySourceSha256'], 'Published summary source mismatch')
    require(summary['key'] == product['assets']['summary']['key'], 'Summary mapping mismatch')
    chapters = [store.read_record(f'{SLUG}/audio/chapter-{number}-record.json') for number in range(1, 9)]
    require([c['pages'] for c in chapters] == spec['chapters'], 'Final chapter coverage mismatch')
    require([c['key'] for c in chapters] == [c['key'] for c in product['assets']['chapters']], 'Final chapter mapping mismatch')
    require([c['id'] for c in chapters] == [c['id'] for c in product['assets']['chapters']], 'Final chapter IDs mismatch')
    require(len({t['sha256'] for t in [summary, *chapters]}) == 9, 'Duplicate audiobook content')
    with tempfile.TemporaryDirectory(prefix='detran-final-audit-') as tmp:
        pdf = Path(tmp) / 'publication.pdf'
        store.client.download_file(store.bucket, product['assets']['pdfKey'], str(pdf))
        originals = prepare_texts(pdf)
        for completed, original in zip(chapters, originals):
            expected = digest((base.VOICE_NAME + '\n' + spec['pdfSha256'] + '\n' + original['text']).encode())
            require(completed['sourceSha256'] == expected, 'Final chapter narration source mismatch')
            require(completed['words'] == len(original['text'].split()), 'Final chapter word count mismatch')
        file = Path(tmp) / 'audio.mp3'
        for track in [summary, *chapters]:
            store.client.download_file(store.bucket, track['key'], str(file))
            require(digest(file.read_bytes()) == track['sha256'], 'Final audio checksum mismatch')
            require(abs(audio_details(file) - track['durationSeconds']) < 0.1, 'Final audio duration mismatch')
            store.range(track['key'], file.read_bytes()[:32])
    manifest = {'slug': SLUG, 'voice': base.VOICE_NAME, 'language': 'pt-BR', 'pdfSha256': spec['pdfSha256'], 'coverSha256': spec['coverSha256'], 'pageCount': spec['pageCount'], 'summary': summary, 'chapters': chapters}
    store.record(f'{SLUG}/audio/manifest.json', manifest)
    print(json.dumps({'slug': SLUG, 'pages': spec['pageCount'], 'chapters': len(chapters), 'summarySeconds': summary['durationSeconds'], 'totalSeconds': round(sum(t['durationSeconds'] for t in [summary, *chapters]), 3)}, ensure_ascii=False), flush=True)
    print('COMPLETE: DETRAN PDF, cover, summary and eight full chapters verified privately', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['validate', 'sources', 'chapter', 'finalize'])
    parser.add_argument('--source-dir', type=Path)
    parser.add_argument('--chapter', type=int)
    args = parser.parse_args()
    if args.action in ('validate', 'sources') and not args.source_dir:
        parser.error('--source-dir is required')
    if args.action == 'validate':
        for track in validate_sources(args.source_dir):
            print(json.dumps({'id': track['id'], 'pages': track['pages'], 'words': len(track['text'].split())}))
    elif args.action == 'sources':
        publish_sources(args.source_dir)
    elif args.action == 'chapter':
        if args.chapter is None:
            parser.error('--chapter is required')
        publish_chapter(args.chapter)
    else:
        finalize()


if __name__ == '__main__':
    main()
