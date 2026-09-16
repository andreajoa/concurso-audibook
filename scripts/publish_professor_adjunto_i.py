#!/usr/bin/env python3
"""One-shot publisher for Professor Adjunto I — Santos/IBAM 2026.

Downloads the exact owner-supplied PDF, 3D PNG cover and summary MP3 from
short-lived staging URLs; validates every source byte; publishes paid media to
private Cloudflare R2; generates eight pt-BR audiobook chapters from the PDF;
and prepares the storefront catalog/public binary cover. This file is removed
before the production commit.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import boto3
import fitz
import requests
from botocore.config import Config
from PIL import Image
from piper import PiperVoice

ROOT = Path(__file__).resolve().parents[1]
SLUG = 'professor-adjunto-i-ibam-santos-2026'
ACCOUNT_ID = 'dbad4dc0550693a69d5956df7344e001'
BUCKET = 'apostila'
ENDPOINT = f'https://{ACCOUNT_ID}.r2.cloudflarestorage.com'
VOICE_NAME = 'pt_BR-cadu-medium'
VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/cadu/medium'
VOICE_MODEL_URL = f'{VOICE_BASE}/{VOICE_NAME}.onnx?download=true'
VOICE_CONFIG_URL = f'{VOICE_BASE}/{VOICE_NAME}.onnx.json?download=true'

PDF_SHA = 'dd6ff571fd63e2d1da58e8f0f3d7699d154aa9ad06e190b706180655d276e809'
PDF_SIZE = 1394810
COVER_SHA = 'ffb24a6d1c9a8cc8eda4eaadc37a68a6474e105f07d9790c77bbb416f85da013'
COVER_SIZE = 2226830
SUMMARY_SHA = '0fed8c43fc3fe614bd7b88a326d7c4c1f58c5e43c4423c927851172970497e81'
SUMMARY_SIZE = 16295946

PDF_KEY = f'{SLUG}/docs/professor-adjunto-i-santos-2026.pdf'
COVER_KEY = f'{SLUG}/images/professor-adjunto-i-capa.png'
SUMMARY_KEY = f'{SLUG}/audio/resumo.mp3'
AUDIO_PREFIX = f'{SLUG}/audio/pt-br-v1'
MANIFEST_KEY = f'{SLUG}/audio/manifest.json'
PUBLIC_COVER = ROOT / 'public/assets/apostila-professor-adjunto-i-3d.png'

# Physical PDF pages (1-indexed). Pages 2-4 are the print TOC and pages
# 130-132 are the alphabetical index / parity pages, so the spoken course
# covers the teaching body exactly once from physical pages 5 through 129.
CHAPTERS = [
    ('01-revisao-legislacao', 'Revisão final, raio-X e legislação', 'Edital, pesos, PNE 2026, legislação federal e municipal de Santos', 5, 25),
    ('02-lingua-portuguesa', 'Parte I — Língua Portuguesa', 'Interpretação, coesão, gramática, gêneros e questões guiadas', 26, 35),
    ('03-conhecimentos-gerais', 'Parte II — Conhecimentos Gerais', 'Fundamentos, LDB, ECA, BNCC, didática, avaliação, inclusão e gestão', 36, 53),
    ('04-autores-do-edital', 'Parte III — Autores do Edital', 'Freire, Libâneo, Hoffmann, Zabala, Perrenoud, Soares, Solé e demais autores', 54, 65),
    ('05-conhecimentos-especificos', 'Parte IV — Conhecimentos Específicos', 'Educação Infantil, alfabetização, anos iniciais, EJA, inclusão e prática pedagógica', 66, 91),
    ('06-dissertativa-banco-questoes', 'Partes V e VI — Dissertativa + 80 questões', 'Argumentação pedagógica, modelos, treino e banco temático comentado', 92, 107),
    ('07-tres-simulados', 'Parte VII — Três simulados completos', '120 questões no formato da prova, com gabaritos comentados', 108, 125),
    ('08-revisao-final-caderno-erros', 'Parte VIII — Revisão final e caderno de erros', '30 ideias automáticas, mapa de autores, estratégia de revisão e fontes', 126, 129),
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, target: Path, expected_size: int, expected_sha: str) -> None:
    print(f'DOWNLOAD {target.name}', flush=True)
    with requests.get(url, stream=True, timeout=240) as r:
        r.raise_for_status()
        with target.open('wb') as f:
            for chunk in r.iter_content(1024 * 1024):
                if chunk:
                    f.write(chunk)
    if target.stat().st_size != expected_size:
        raise RuntimeError(f'Unexpected size for {target.name}: {target.stat().st_size} != {expected_size}')
    got = sha256(target)
    if got != expected_sha:
        raise RuntimeError(f'SHA-256 mismatch for {target.name}: {got}')
    print(f'VERIFIED SOURCE {target.name}: {target.stat().st_size} bytes sha256={got}', flush=True)


def validate_sources(pdf: Path, cover: Path, summary: Path) -> None:
    if pdf.read_bytes()[:5] != b'%PDF-':
        raise RuntimeError('PDF signature invalid')
    doc = fitz.open(pdf)
    if doc.page_count != 132:
        raise RuntimeError(f'Expected 132 PDF pages, got {doc.page_count}')
    rect = doc[0].rect
    if abs(rect.width - 595.28) > 1 or abs(rect.height - 841.89) > 1:
        raise RuntimeError(f'Expected A4 PDF, got {rect.width}x{rect.height} points')
    probes = {
        5: 'REVISÃO FINAL', 26: 'PARTE I', 36: 'PARTE II', 54: 'PARTE III',
        66: 'PARTE IV', 92: 'PARTE V', 98: 'PARTE VI', 108: 'SIMULADO COMPLETO 1',
        114: 'SIMULADO COMPLETO 2', 120: 'SIMULADO COMPLETO 3', 126: 'PARTE VIII'
    }
    for page_no, needle in probes.items():
        text = doc[page_no - 1].get_text('text')
        if needle not in text:
            raise RuntimeError(f'Expected heading {needle!r} on physical page {page_no}')
    doc.close()

    sig = cover.read_bytes()[:8]
    if sig != b'\x89PNG\r\n\x1a\n':
        raise RuntimeError('Cover is not a real PNG binary')
    with Image.open(cover) as im:
        im.verify()
    with Image.open(cover) as im:
        if im.size != (1122, 1402) or im.mode != 'RGBA':
            raise RuntimeError(f'Unexpected cover properties: {im.size} {im.mode}')
    print('COVER VERIFIED: PNG 1122x1402 RGBA, integrity OK', flush=True)

    probe = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration,format_name',
        '-of', 'json', str(summary)
    ], capture_output=True, text=True, check=True)
    info = json.loads(probe.stdout)['format']
    duration = float(info['duration'])
    if not 1010 <= duration <= 1025:
        raise RuntimeError(f'Unexpected summary duration: {duration}')
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(summary), '-f', 'null', '-'], check=True)
    print(f'SUMMARY VERIFIED: MP3 {duration:.2f}s, full decode OK', flush=True)


def r2_client():
    access = os.environ.get('R2_ACCESS_KEY_ID', '').strip()
    secret = os.environ.get('R2_SECRET_ACCESS_KEY', '').strip()
    if not access or not secret:
        raise RuntimeError('Missing R2 credentials')
    return boto3.client('s3', endpoint_url=ENDPOINT, region_name='auto',
        aws_access_key_id=access, aws_secret_access_key=secret,
        config=Config(signature_version='s3v4', retries={'max_attempts': 6, 'mode': 'standard'}))


def remote_sha(s3, key: str) -> str:
    obj = s3.get_object(Bucket=BUCKET, Key=key)
    h = hashlib.sha256()
    try:
        for chunk in obj['Body'].iter_chunks(chunk_size=1024 * 1024):
            h.update(chunk)
    finally:
        obj['Body'].close()
    return h.hexdigest()


def upload_verified(s3, file: Path, key: str, content_type: str, metadata=None) -> str:
    checksum = sha256(file)
    s3.upload_file(str(file), BUCKET, key, ExtraArgs={
        'ContentType': content_type,
        'CacheControl': 'private, no-store',
        'Metadata': {'sha256': checksum, **(metadata or {})}
    })
    if remote_sha(s3, key) != checksum:
        raise RuntimeError(f'R2 byte verification failed: {key}')
    url = s3.generate_presigned_url('get_object', Params={'Bucket': BUCKET, 'Key': key}, ExpiresIn=120)
    response = requests.get(url, headers={'Range': 'bytes=0-31'}, timeout=30)
    if response.status_code != 206 or len(response.content) != 32:
        raise RuntimeError(f'Private byte-range streaming failed: {key} ({response.status_code})')
    print(f'R2 VERIFIED {key}: {file.stat().st_size} bytes, Range 206 OK', flush=True)
    return checksum


def normalize_text(text: str) -> str:
    text = text.replace('\u00a0', ' ').replace('\u00ad', '')
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            lines.append('')
            continue
        if re.search(r'^TRILHA APROVA CONCURSOS\s*(\||PROFESSOR)', line, re.I):
            continue
        if re.search(r'^TRILHA APROVA CONCURSOS\s+PROFESSOR ADJUNTO I', line, re.I):
            continue
        if re.search(r'\bPROFESSOR ADJUNTO I\s*[•\-|].*SANTOS 2026\s+\d+\s*/\s*\d+\s*$', line, re.I):
            continue
        if re.fullmatch(r'\d+\s*/\s*\d+', line):
            continue
        lines.append(line)
    text = '\n'.join(lines)
    replacements = {
        '•': '; ', '→': ' para ', '×': ' vezes ', '÷': ' dividido por ',
        'R$': ' reais ', '%': ' por cento ', ' nº ': ' número '
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r'(?m)^([ABCD])\)\s*', r'Alternativa \1: ', text)
    text = re.sub(r'(?m)^(\d{1,3})\.\s+', r'Questão \1. ', text)
    for token, spoken in {
        'IBAM': 'Ibam', 'BNCC': 'B N C C', 'AEE': 'A E E', 'ECA': 'E C A',
        'LDB': 'L D B', 'PNE': 'P N E', 'PME': 'P M E', 'PPP': 'P P P',
        'DUA': 'D U A', 'EJA': 'E J A', 'LBI': 'L B I', 'TEA': 'T E A',
        'SEDUC': 'Seduc', 'CNE': 'C N E', 'DCNEI': 'D C N E I'
    }.items():
        text = re.sub(rf'\b{token}\b', spoken, text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def extract_chapter(doc: fitz.Document, first: int, last: int) -> str:
    parts = []
    for page_no in range(first, last + 1):
        text = normalize_text(doc[page_no - 1].get_text('text'))
        if len(text) < 80:
            raise RuntimeError(f'Insufficient extracted text on physical page {page_no}')
        parts.append(text)
    return '\n\n'.join(parts)


def split_text(text: str, target=1450, hard=1850):
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    out, current = [], ''
    for paragraph in paragraphs:
        sentences = re.split(r'(?<=[.!?;:])\s+', paragraph)
        for sentence in sentences:
            if len(sentence) > hard:
                words = sentence.split()
                pieces, part = [], ''
                for word in words:
                    candidate = f'{part} {word}'.strip()
                    if part and len(candidate) > hard:
                        pieces.append(part); part = word
                    else:
                        part = candidate
                if part: pieces.append(part)
            else:
                pieces = [sentence]
            for piece in pieces:
                candidate = f'{current} {piece}'.strip()
                if current and len(candidate) > target:
                    out.append(current); current = piece
                else:
                    current = candidate
    if current: out.append(current)
    if not out or any(len(c) > hard for c in out):
        raise RuntimeError('Speech chunking failed')
    return out


def ensure_voice(work: Path) -> Path:
    model = work / f'{VOICE_NAME}.onnx'
    config = work / f'{VOICE_NAME}.onnx.json'
    for url, target in [(VOICE_MODEL_URL, model), (VOICE_CONFIG_URL, config)]:
        with requests.get(url, stream=True, timeout=240) as r:
            r.raise_for_status()
            with target.open('wb') as f:
                for chunk in r.iter_content(1024 * 1024):
                    if chunk: f.write(chunk)
        if target.stat().st_size < 1000:
            raise RuntimeError(f'Voice download too small: {target.name}')
    return model


def join_mp3(wavs: list[Path], output: Path) -> None:
    listing = output.with_suffix('.concat.txt')
    with listing.open('w') as f:
        for wav in wavs:
            f.write("file '" + str(wav).replace("'", "'\\''") + "'\n")
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'concat', '-safe', '0', '-i', str(listing),
        '-vn', '-ac', '1', '-ar', '44100', '-b:a', '96k', str(output)
    ], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(output), '-f', 'null', '-'], check=True)


def duration_seconds(path: Path) -> float:
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(path)], capture_output=True, text=True, check=True)
    return float(json.loads(result.stdout)['format']['duration'])


def product_definition():
    chapters = []
    for index, (stem, title, subtitle, first, last) in enumerate(CHAPTERS, 1):
        chapters.append({
            'id': f'c{index}', 'title': title, 'subtitle': subtitle,
            'key': f'{AUDIO_PREFIX}/{stem}.mp3', 'downloadName': f'{stem}.mp3'
        })
    return {
        'slug': SLUG,
        'active': True,
        'brand': 'Trilha Aprova',
        'contest': 'Concurso Prefeitura de Santos — Edital nº 79/2026',
        'examBoard': 'IBAM',
        'category': 'Educação',
        'name': 'Professor Adjunto I — Prefeitura de Santos 2026 · curso completo + audiobook',
        'shortName': 'Professor Adjunto I — Santos 2026',
        'metaTitle': 'Professor Adjunto I Santos 2026 + audiobook',
        'edition': 'Santos 2026 — Edição Definitiva',
        'author': 'Margareth Almeida',
        'audience': 'Professor Adjunto I (código 101) — Prefeitura de Santos',
        'currency': 'brl',
        'priceCents': 2499,
        'compareAtCents': 4999,
        'stripePriceEnv': 'STRIPE_PRICE_PROFESSOR_ADJUNTO_I_IBAM_SANTOS_2026',
        'description': 'Curso preparatório completo para Professor Adjunto I da Prefeitura de Santos 2026, banca IBAM, com legislação federal e municipal, Língua Portuguesa, conhecimentos gerais, autores do edital, Educação Infantil, anos iniciais, EJA, inclusão, prova dissertativa, questões comentadas, três simulados e revisão final.',
        'seoDescription': 'Apostila de Professor Adjunto I para Santos 2026 (IBAM): teoria do zero, legislação, autores, específicos, dissertativa, 200 questões e audiobook.',
        'storefront': {
            'badge': 'CONCURSO PREFEITURA DE SANTOS • EDITAL 79/2026 • BANCA IBAM',
            'cover3d': 'https://www.concursotrilhaaprova.online/assets/apostila-professor-adjunto-i-3d.png',
            'cta': 'Quero esta apostila + audiobook'
        },
        'funnel': {'orderBump': [], 'upsell': [], 'crossSell': [], 'downsell': []},
        'proofPoints': [
            '132 páginas na edição final para impressão e estudo digital',
            'Edital nº 79/2026 + Rerratificações nº 83/2026 e nº 90/2026',
            'Legislação federal e municipal, autores, Educação Infantil, anos iniciais, EJA e inclusão',
            'Prova dissertativa com modelos, mapas de argumentação e treino guiado',
            '200 questões ao longo do curso, incluindo três simulados completos',
            'PDF para leitura online ou download',
            'Resumo em áudio + audiobook completo em 8 capítulos',
            'Pagamento único — sem assinatura'
        ],
        'assets': {
            'coverKey': COVER_KEY,
            'pdfKey': PDF_KEY,
            'pdfDownloadName': 'Professor_Adjunto_I_Santos_2026_Edicao_Definitiva.pdf',
            'summary': {
                'id': 'summary',
                'title': 'Resumo da Apostila — A lógica do concurso de Santos 2026',
                'subtitle': 'Visão estratégica da prova e do curso antes dos capítulos completos',
                'key': SUMMARY_KEY,
                'downloadName': 'Resumo_A_logica_do_concurso_de_Santos_2026.mp3'
            },
            'chapters': chapters
        },
        'exam': {
            'date': '2026-11-29',
            'confirmed': False,
            'source': 'Edital nº 79/2026 — Prefeitura de Santos (banca IBAM)',
            'sourceUrl': 'https://www.santos.sp.gov.br/?q=servico/concursos-publicos',
            'note': 'Data prevista no material conforme o edital; confirmar a convocação oficial antes da prova.'
        }
    }


def update_storefront_sources() -> None:
    catalog_path = ROOT / 'products/catalog.json'
    catalog = json.loads(catalog_path.read_text())
    if SLUG in catalog:
        raise RuntimeError(f'Product already exists in catalog: {SLUG}')
    catalog[SLUG] = product_definition()
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')

    build_path = ROOT / 'scripts/build-seo.cjs'
    source = build_path.read_text()
    old = """  const isAutores = p.slug.startsWith('autores');\n\n  const fit = isAutores\n    ? 'Esta apostila revisa autores para Professor Adjunto I e Professor Adjunto II — Educação Especial, com foco na banca IBAM e na edição Santos 2026. Não substitui o estudo de todas as disciplinas do edital.'\n    : 'Esta apostila trabalha redação para candidatos de ensino fundamental completo. O gênero textual e os critérios cobrados variam conforme o edital; não é uma apostila específica de todas as disciplinas de um cargo.';"""
    new = """  const isAutores = p.slug.startsWith('autores');\n  const isRedacao = p.slug.startsWith('redacao');\n\n  const fit = isAutores\n    ? 'Esta apostila revisa autores para Professor Adjunto I e Professor Adjunto II — Educação Especial, com foco na banca IBAM e na edição Santos 2026. Não substitui o estudo de todas as disciplinas do edital.'\n    : isRedacao\n      ? 'Esta apostila trabalha redação para candidatos de ensino fundamental completo. O gênero textual e os critérios cobrados variam conforme o edital; não é uma apostila específica de todas as disciplinas de um cargo.'\n      : `Esta apostila foi desenvolvida especificamente para ${p.audience}, com conteúdo direcionado a ${p.contest} e à banca ${p.examBoard}. Compare o sumário com o conteúdo programático oficial do cargo antes da compra.`;"""
    if old not in source:
        raise RuntimeError('Could not locate product-fit block in build-seo.cjs')
    source = source.replace(old, new, 1)
    old_title = "metaTitle: p.shortName + ' com audiobook | Trilha Aprova',"
    new_title = "metaTitle: (p.metaTitle || (p.shortName + ' com audiobook')) + ' | Trilha Aprova',"
    if old_title not in source:
        raise RuntimeError('Could not locate product meta title line')
    source = source.replace(old_title, new_title, 1)
    build_path.write_text(source)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf-url', required=True)
    parser.add_argument('--cover-url', required=True)
    parser.add_argument('--summary-url', required=True)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix='professor-adjunto-i-') as tmp:
        work = Path(tmp)
        pdf, cover, summary = work/'source.pdf', work/'cover.png', work/'summary.mp3'
        download(args.pdf_url, pdf, PDF_SIZE, PDF_SHA)
        download(args.cover_url, cover, COVER_SIZE, COVER_SHA)
        download(args.summary_url, summary, SUMMARY_SIZE, SUMMARY_SHA)
        validate_sources(pdf, cover, summary)

        s3 = r2_client()
        pdf_hash = upload_verified(s3, pdf, PDF_KEY, 'application/pdf', {'source': 'owner-final-kdp-pdf'})
        cover_hash = upload_verified(s3, cover, COVER_KEY, 'image/png', {'source': 'owner-3d-cover'})
        summary_hash = upload_verified(s3, summary, SUMMARY_KEY, 'audio/mpeg', {'source': 'owner-audio-summary'})

        model_path = ensure_voice(work)
        voice = PiperVoice.load(str(model_path))
        doc = fitz.open(pdf)
        manifest = {
            'slug': SLUG, 'language': 'pt-BR', 'voice': VOICE_NAME,
            'sourcePdfSha256': pdf_hash, 'coverSha256': cover_hash,
            'summary': {'key': SUMMARY_KEY, 'sha256': summary_hash, 'durationSeconds': round(duration_seconds(summary), 2)},
            'chapters': []
        }
        for index, (stem, title, subtitle, first, last) in enumerate(CHAPTERS, 1):
            body = extract_chapter(doc, first, last)
            spoken = (
                f'Trilha Aprova. Professor Adjunto Um, Santos 2026. Capítulo {index}: {title}. '
                f'{subtitle}. Este capítulo corresponde às páginas físicas {first} a {last} do curso.\n\n'
                + body + '\n\nFim deste capítulo.'
            )
            chunks = split_text(spoken)
            wavs = []
            print(f'TTS CHAPTER {index}/8: {len(chunks)} chunks, pages {first}-{last}', flush=True)
            for n, chunk in enumerate(chunks, 1):
                wav = work / f'{stem}-{n:03d}.wav'
                with wave.open(str(wav), 'wb') as stream:
                    voice.synthesize_wav(chunk, stream)
                if wav.stat().st_size < 1000:
                    raise RuntimeError(f'Piper output too small: {wav.name}')
                wavs.append(wav)
                if n == 1 or n % 10 == 0 or n == len(chunks):
                    print(f'  chunk {n}/{len(chunks)}', flush=True)
            mp3 = work / f'{stem}.mp3'
            join_mp3(wavs, mp3)
            duration = duration_seconds(mp3)
            words_per_second = len(spoken.split()) / duration
            if not 0.45 <= words_per_second <= 5.0:
                raise RuntimeError(f'Implausible speech duration chapter {index}: {duration}s / {words_per_second:.2f} wps')
            key = f'{AUDIO_PREFIX}/{stem}.mp3'
            fingerprint = hashlib.sha256((PDF_SHA + '\n' + VOICE_NAME + '\n' + str(first) + '-' + str(last) + '\n' + spoken).encode()).hexdigest()
            checksum = upload_verified(s3, mp3, key, 'audio/mpeg', {'source-sha256': fingerprint, 'pages': f'{first}-{last}'})
            manifest['chapters'].append({
                'id': f'c{index}', 'title': title, 'key': key, 'pages': [first, last],
                'durationSeconds': round(duration, 2), 'sha256': checksum, 'sourceSha256': fingerprint
            })
            for wav in wavs: wav.unlink(missing_ok=True)
        doc.close()

        # Completion record exists only after every paid object passed byte and Range verification.
        s3.put_object(Bucket=BUCKET, Key=MANIFEST_KEY,
            Body=json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8'),
            ContentType='application/json', CacheControl='private, no-store')

        PUBLIC_COVER.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(cover, PUBLIC_COVER)
        if sha256(PUBLIC_COVER) != COVER_SHA:
            raise RuntimeError('Public GitHub cover copy changed bytes')
        update_storefront_sources()
        print('MEDIA COMPLETE: PDF + cover + owner summary + 8 audiobook chapters verified in private R2', flush=True)
        print('STOREFRONT SOURCES READY: catalog + binary public cover + SEO generator patch', flush=True)

if __name__ == '__main__':
    main()
