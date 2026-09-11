#!/usr/bin/env python3
"""Generate the IBAM audiobook in Brazilian Portuguese and publish it to Cloudflare R2.

Production delivery remains GitHub + Vercel + Cloudflare R2.
Speech is synthesized during GitHub Actions with the open-source Piper pt_BR voice.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable

import boto3
import fitz
import requests
from botocore.config import Config
from botocore.exceptions import ClientError
from pypdf import PdfReader

ACCOUNT_ID = "dbad4dc0550693a69d5956df7344e001"
BUCKET = "apostila"
PUBLIC_BASE = "https://pub-7783b168338945eebb519768f0dbd176.r2.dev"
R2_ENDPOINT = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"

PDF_KEY = "docs/apostila-autores-ibam-santos-2026.pdf"
COVER_KEY = "images/apostila-autores-capa.png"
SUMMARY_KEY = "autores-ibam-2026/resumo-como-desarmar-armadilhas-ibam.mp3"
MANIFEST_KEY = "autores-ibam-2026/audiobook-manifest-pt-br-v2.json"
AUDIO_PREFIX = "audio/pt-br-v2"

VOICE_NAME = "pt_BR-cadu-medium"
VOICE_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/cadu/medium"
VOICE_MODEL_URL = f"{VOICE_BASE}/{VOICE_NAME}.onnx?download=true"
VOICE_CONFIG_URL = f"{VOICE_BASE}/{VOICE_NAME}.onnx.json?download=true"

CHAPTERS = [
    ("01-mapa-mae", "Antes de começar + Mapa-mãe"),
    ("02-autores-comuns", "Autores comuns aos dois cargos"),
    ("03-professor-adjunto-i", "Professor Adjunto I"),
    ("04-educacao-especial-matrizes", "Educação Especial + matrizes de confusão"),
    ("05-questoes-01-30", "Questões autorais 1 a 30"),
    ("06-questoes-31-60", "Questões autorais 31 a 60"),
    ("07-questoes-ibam-simulado", "Questões IBAM + simulado 61 a 100"),
    ("08-gabarito-revisao", "Gabarito + revisão de véspera"),
]


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def r2_client():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        region_name="auto",
        aws_access_key_id=required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("R2_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
    )


def object_exists(s3, key: str) -> bool:
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status in (403, 404):
            return False
        raise


def upload_file(s3, source: Path, key: str, content_type: str) -> None:
    print(f"Uploading s3://{BUCKET}/{key}")
    s3.upload_file(
        str(source),
        BUCKET,
        key,
        ExtraArgs={
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000, immutable",
        },
    )


def download_file(url: str, target: Path) -> None:
    print(f"Downloading {target.name}")
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
    if target.stat().st_size < 1000:
        raise RuntimeError(f"Downloaded voice file is unexpectedly small: {target}")


def ensure_voice(workdir: Path) -> Path:
    model = workdir / f"{VOICE_NAME}.onnx"
    config = workdir / f"{VOICE_NAME}.onnx.json"
    download_file(VOICE_MODEL_URL, model)
    download_file(VOICE_CONFIG_URL, config)
    print(f"Brazilian Portuguese voice ready: {VOICE_NAME}")
    return model


def render_cover(pdf_path: Path, target: Path) -> None:
    print("Rendering cover from page 1 of the R2 PDF.")
    doc = fitz.open(str(pdf_path))
    page = doc.load_page(0)
    pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
    pix.save(str(target))
    doc.close()


def ensure_source_assets(s3, workdir: Path) -> Path:
    pdf_path = workdir / "apostila.pdf"
    cover_path = workdir / "capa.png"

    if not object_exists(s3, PDF_KEY):
        raise RuntimeError(f"Required source PDF is missing from R2: s3://{BUCKET}/{PDF_KEY}")

    print("Downloading source PDF from R2 for text extraction.")
    s3.download_file(BUCKET, PDF_KEY, str(pdf_path))

    if not object_exists(s3, COVER_KEY):
        render_cover(pdf_path, cover_path)
        upload_file(s3, cover_path, COVER_KEY, "image/png")
    else:
        print("Cover already exists in R2.")

    return pdf_path


def extract_pages(pdf_path: Path) -> list[str]:
    reader = PdfReader(str(pdf_path))
    pages = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if not text.strip():
            raise RuntimeError(f"No text extracted from PDF page {index}")
        pages.append(text)
    if len(pages) < 34:
        raise RuntimeError(f"Expected at least 34 pages, got {len(pages)}")
    return pages


def strip_repeated_layout(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("•", " - ")
    text = re.sub(r"APOSTILA\s+DE\s+AUTORES\s*-?\s*IBAM\s*-?\s*SANTOS\s+2026", "", text, flags=re.I)
    text = re.sub(
        r"Material\s+independente\s*-?\s*Professor\s+Adjunto\s+I\s+e\s+Professor\s+Adjunto\s+II\s*-?\s*Educa[cç][aã]o\s+Especial",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"\bP[aá]gina\s+\d+\b", "", text, flags=re.I)
    text = text.replace("→", "; ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def regex_pos(text: str, pattern: str, start: int = 0, label: str | None = None) -> int:
    match = re.search(pattern, text[start:], flags=re.I | re.S)
    if not match:
        raise RuntimeError(f"Could not locate PDF section: {label or pattern}")
    return start + match.start()


def prepare_for_speech(text: str, chapter_number: int) -> str:
    title = CHAPTERS[chapter_number - 1][1]
    text = strip_repeated_layout(text)
    text = re.sub(r"(?m)^([ABCD])\)\s*", r"Alternativa \1: ", text)
    text = re.sub(r"(?m)^(\d{1,3})\.\s+", r"Questão \1. ", text)
    text = re.sub(r"(?m)^SENHA DE MEMÓRIA\s*$", "Senha de memória.", text, flags=re.I)
    text = re.sub(r"(?m)^ASSINATURA DE PROVA\s*$", "Assinatura de prova.", text, flags=re.I)
    text = re.sub(r"(?m)^OBRA DO EDITAL\s*$", "Obra do edital.", text, flags=re.I)
    text = re.sub(r"(?m)^IDEIA CENTRAL:\s*", "Ideia central: ", text, flags=re.I)
    text = re.sub(r"(?m)^PALAVRAS-GATILHO:\s*", "Palavras-gatilho: ", text, flags=re.I)
    text = re.sub(r"(?m)^PEGADINHA IBAM:\s*", "Pegadinha IBAM: ", text, flags=re.I)
    text = re.sub(r"(?m)^NÃO CONFUNDA:\s*", "Não confunda: ", text, flags=re.I)
    text = re.sub(r"\s*\+\s*", " mais ", text)
    text = re.sub(r"\s*=\s*", " é igual a ", text)
    text = re.sub(r"\bIBAM\b", "Ibam", text)
    text = re.sub(r"\bAEE\b", "A E E", text)
    text = re.sub(r"\bBNCC\b", "B N C C", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    opening = (
        f"Sala de Estudos Margareth Almeida. Capítulo {chapter_number}: {title}. "
        "Este áudio está em português brasileiro. Acompanhe com atenção e use a velocidade do player para revisar.\n\n"
    )
    return opening + text.strip() + "\n\nFim deste capítulo."


def build_chapter_texts(pages: list[str]) -> list[str]:
    intro = strip_repeated_layout(pages[1])
    mapa_page = strip_repeated_layout(pages[3])
    p2_pattern = r"PARTE\s+II\s*[-–—]?\s*AUTORES\s+COMUNS\s+AOS\s+DOIS\s+CARGOS"
    p3_pattern = r"PARTE\s+III\s*[-–—]?\s*PROFESSOR\s+ADJUNTO\s+I\b"
    p4_pattern = r"PARTE\s+IV\s*[-–—]?\s*PROFESSOR\s+ADJUNTO\s+II\s*[-–—]?\s*EDUCA[CÇ][AÃ]O\s+ESPECIAL"
    p6_pattern = r"PARTE\s+VI\s*[-–—]?\s*60\s+QUEST[ÕO]ES\s+AUTORAIS(?:\s+DE\s+FIXA[CÇ][AÃ]O)?"
    p7_pattern = r"PARTE\s+VII\s*[-–—]?\s*24\s+QUEST[ÕO]ES\s+DE\s+PROVAS\s+IBAM"
    p9_pattern = r"PARTE\s+IX\s*[-–—]?\s*GABARITO"
    p10_pattern = r"PARTE\s+X\s*[-–—]?\s*BIBLIOGRAFIA"

    part2_in_mapa = regex_pos(mapa_page, p2_pattern, label="PARTE II")
    chapter1 = intro + "\n\n" + mapa_page[:part2_in_mapa]
    full = "\n\n".join(strip_repeated_layout(page) for page in pages[3:])

    p2 = regex_pos(full, p2_pattern, label="PARTE II")
    p3 = regex_pos(full, p3_pattern, p2, "PARTE III")
    p4 = regex_pos(full, p4_pattern, p3, "PARTE IV")
    p6 = regex_pos(full, p6_pattern, p4, "PARTE VI")
    p7 = regex_pos(full, p7_pattern, p6, "PARTE VII")
    p9 = regex_pos(full, p9_pattern, p7, "PARTE IX")
    p10 = regex_pos(full, p10_pattern, p9, "PARTE X")

    part6 = full[p6:p7]
    q31_match = re.search(r"(?:^|\n)\s*31\.\s+", part6)
    if not q31_match:
        raise RuntimeError("Could not split questions 1-30 from 31-60")
    q31 = q31_match.start()

    chapters = [
        chapter1,
        full[p2:p3],
        full[p3:p4],
        full[p4:p6],
        part6[:q31],
        part6[q31:],
        full[p7:p9],
        full[p9:p10],
    ]
    return [prepare_for_speech(text, i + 1) for i, text in enumerate(chapters)]


def chunk_text(text: str, target: int = 1500, hard_max: int = 1900) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""

    def split_long(paragraph: str) -> Iterable[str]:
        if len(paragraph) <= hard_max:
            yield paragraph
            return
        sentences = re.split(r"(?<=[.!?;:])\s+", paragraph)
        buffer = ""
        for sentence in sentences:
            candidate = f"{buffer} {sentence}".strip()
            if len(candidate) > hard_max and buffer:
                yield buffer
                buffer = sentence
            elif len(sentence) > hard_max:
                words = sentence.split()
                piece = ""
                for word in words:
                    candidate_word = f"{piece} {word}".strip()
                    if len(candidate_word) > hard_max and piece:
                        yield piece
                        piece = word
                    else:
                        piece = candidate_word
                buffer = piece
            else:
                buffer = candidate
        if buffer:
            yield buffer

    for paragraph in paragraphs:
        for part in split_long(paragraph):
            candidate = f"{current}\n\n{part}".strip()
            if current and len(candidate) > target:
                chunks.append(current)
                current = part
            else:
                current = candidate
    if current:
        chunks.append(current)
    return chunks


def generate_chunk(model: Path, text: str, destination: Path) -> Path:
    wav = destination.with_suffix(".wav")
    subprocess.run(
        [sys.executable, "-m", "piper", "-m", str(model), "-f", str(wav), "--", text],
        check=True,
        timeout=300,
    )
    if not wav.exists() or wav.stat().st_size < 1000:
        raise RuntimeError(f"Piper did not generate valid audio: {wav}")
    return wav


def join_audio(parts: list[Path], output: Path) -> None:
    list_file = output.with_suffix(".concat.txt")
    with list_file.open("w", encoding="utf-8") as handle:
        for part in parts:
            escaped = str(part).replace("'", "'\\''")
            handle.write(f"file '{escaped}'\n")

    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-vn", "-ac", "1", "-ar", "22050", "-codec:a", "libmp3lame", "-b:a", "96k", str(output),
        ],
        check=True,
    )


def generate_chapter(model: Path, chapter_id: str, title: str, text: str, workdir: Path) -> Path:
    chunks = chunk_text(text)
    print(f"Generating pt-BR {chapter_id}: {title} ({len(text)} chars, {len(chunks)} chunks)")
    chapter_dir = workdir / chapter_id
    chapter_dir.mkdir(parents=True, exist_ok=True)
    generated: list[Path] = []
    for index, chunk in enumerate(chunks, start=1):
        print(f"  pt-BR TTS chunk {index}/{len(chunks)}")
        generated.append(generate_chunk(model, chunk, chapter_dir / f"part-{index:03d}.wav"))
    output = workdir / f"{chapter_id}.mp3"
    join_audio(generated, output)
    return output


def main() -> None:
    s3 = r2_client()
    with tempfile.TemporaryDirectory(prefix="concurso-audiobook-ptbr-") as temp:
        workdir = Path(temp)
        model = ensure_voice(workdir)
        pdf_path = ensure_source_assets(s3, workdir)
        pages = extract_pages(pdf_path)
        chapter_texts = build_chapter_texts(pages)

        manifest = {
            "title": "Quem disse o quê? - Apostila de Autores - Banca IBAM",
            "author": "Margareth Almeida",
            "language": "pt-BR",
            "voice": VOICE_NAME,
            "publicBase": PUBLIC_BASE,
            "pdf": f"{PUBLIC_BASE}/{PDF_KEY}",
            "cover": f"{PUBLIC_BASE}/{COVER_KEY}",
            "summary": f"{PUBLIC_BASE}/{SUMMARY_KEY}",
            "chapters": [],
        }

        for (chapter_id, title), text in zip(CHAPTERS, chapter_texts):
            key = f"{AUDIO_PREFIX}/{chapter_id}.mp3"
            output = generate_chapter(model, chapter_id, title, text, workdir)
            upload_file(s3, output, key, "audio/mpeg")
            manifest["chapters"].append({
                "id": chapter_id,
                "title": title,
                "language": "pt-BR",
                "url": f"{PUBLIC_BASE}/{key}",
                "bytes": output.stat().st_size,
            })

        manifest_path = workdir / "audiobook-manifest-pt-br-v2.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        s3.upload_file(
            str(manifest_path), BUCKET, MANIFEST_KEY,
            ExtraArgs={"ContentType": "application/json; charset=utf-8", "CacheControl": "public, max-age=300"},
        )
        print("Brazilian Portuguese audiobook generation completed.")
        print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
