#!/usr/bin/env python3
"""Generate the IBAM audiobook with Cloudflare Workers AI and publish it to R2.

Runtime architecture: GitHub Actions + Cloudflare Workers AI + Cloudflare R2.
No application asset is read from Floot or AI Doc Maker.
"""

from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import tempfile
import time
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
WORKERS_AI_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}"
    "/ai/run/@cf/myshell-ai/melotts"
)

PDF_KEY = "docs/apostila-autores-ibam-santos-2026.pdf"
COVER_KEY = "images/apostila-autores-capa.png"
SUMMARY_KEY = "autores-ibam-2026/resumo-como-desarmar-armadilhas-ibam.mp3"
MANIFEST_KEY = "autores-ibam-2026/audiobook-manifest.json"

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
        raise RuntimeError(
            f"Required source PDF is missing from R2: s3://{BUCKET}/{PDF_KEY}. "
            "The PDF must be uploaded to R2 before audiobook generation."
        )

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
    text = re.sub(r"APOSTILA DE AUTORES\s*-?\s*IBAM\s*-?\s*SANTOS 2026", "", text, flags=re.I)
    text = re.sub(
        r"Material independente\s*-?\s*Professor Adjunto I e Professor Adjunto II\s*-?\s*Educa[cç][aã]o Especial",
        "",
        text,
        flags=re.I,
    )
    text = re.sub(r"\bP[aá]gina\s+\d+\b", "", text, flags=re.I)
    text = text.replace("→", "; ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def index_of(text: str, marker: str, start: int = 0) -> int:
    pos = text.lower().find(marker.lower(), start)
    if pos < 0:
        raise RuntimeError(f"Could not locate marker in PDF text: {marker}")
    return pos


def build_chapter_texts(pages: list[str]) -> list[str]:
    intro = strip_repeated_layout(pages[1])
    mapa_page = strip_repeated_layout(pages[3])
    part2_in_mapa = index_of(mapa_page, "PARTE II - AUTORES COMUNS AOS DOIS CARGOS")
    chapter1 = intro + "\n\n" + mapa_page[:part2_in_mapa]

    full = "\n\n".join(strip_repeated_layout(page) for page in pages[3:])

    p2 = index_of(full, "PARTE II - AUTORES COMUNS AOS DOIS CARGOS")
    p3 = index_of(full, "PARTE III - PROFESSOR ADJUNTO I", p2)
    p4 = index_of(full, "PARTE IV - PROFESSOR ADJUNTO II - EDUCAÇÃO ESPECIAL", p3)
    p6 = index_of(full, "PARTE VI - 60 QUESTÕES AUTORAIS DE FIXAÇÃO", p4)
    p7 = index_of(full, "PARTE VII - 24 QUESTÕES DE PROVAS IBAM", p6)
    p9 = index_of(full, "PARTE IX - GABARITO", p7)
    p10 = index_of(full, "PARTE X - BIBLIOGRAFIA", p9)

    part6 = full[p6:p7]
    q31_match = re.search(r"(?:^|\n)31\.\s", part6)
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
    text = re.sub(r"\n{3,}", "\n\n", text)

    opening = (
        f"Sala de Estudos Margareth Almeida. Capítulo {chapter_number}: {title}. "
        "Acompanhe com atenção e, se desejar, aumente a velocidade no player durante a revisão.\n\n"
    )
    return opening + text.strip() + "\n\nFim deste capítulo."


def chunk_text(text: str, target: int = 1700, hard_max: int = 2100) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    current = ""

    def split_long_paragraph(paragraph: str) -> Iterable[str]:
        if len(paragraph) <= hard_max:
            yield paragraph
            return
        sentences = re.split(r"(?<=[.!?;:])\s+", paragraph)
        buffer = ""
        for sentence in sentences:
            if len(sentence) > hard_max:
                words = sentence.split()
                piece = ""
                for word in words:
                    candidate = f"{piece} {word}".strip()
                    if len(candidate) > hard_max and piece:
                        yield piece
                        piece = word
                    else:
                        piece = candidate
                if piece:
                    if buffer:
                        yield buffer
                        buffer = ""
                    yield piece
                continue
            candidate = f"{buffer} {sentence}".strip()
            if len(candidate) > hard_max and buffer:
                yield buffer
                buffer = sentence
            else:
                buffer = candidate
        if buffer:
            yield buffer

    for paragraph in paragraphs:
        for part in split_long_paragraph(paragraph):
            candidate = f"{current}\n\n{part}".strip()
            if current and len(candidate) > target:
                chunks.append(current)
                current = part
            else:
                current = candidate
    if current:
        chunks.append(current)

    if any(len(chunk) > hard_max for chunk in chunks):
        raise RuntimeError("Internal chunking error: a TTS chunk exceeds hard maximum")
    return chunks


def generate_chunk(token: str, text: str, destination: Path, retries: int = 6) -> Path:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "audio/mpeg, application/json",
    }
    payload = {"prompt": text, "lang": "pt"}

    for attempt in range(1, retries + 1):
        response = requests.post(WORKERS_AI_URL, headers=headers, json=payload, timeout=180)
        if response.ok:
            content_type = response.headers.get("content-type", "").lower()
            if "audio" in content_type:
                destination.write_bytes(response.content)
                return destination

            data = response.json()
            audio_b64 = (data.get("result") or {}).get("audio")
            if not audio_b64:
                raise RuntimeError(f"Workers AI returned no audio field: {str(data)[:500]}")
            raw = base64.b64decode(audio_b64)
            actual = destination.with_suffix(".wav" if raw[:4] == b"RIFF" else ".mp3")
            actual.write_bytes(raw)
            return actual

        body = response.text[:800]
        if response.status_code in (429, 500, 502, 503, 504) and attempt < retries:
            wait = min(60, 3 * (2 ** (attempt - 1)))
            print(f"Workers AI transient error {response.status_code}; retrying in {wait}s: {body}")
            time.sleep(wait)
            continue
        raise RuntimeError(f"Workers AI failed ({response.status_code}): {body}")

    raise RuntimeError("Workers AI retry loop exhausted")


def join_audio(parts: list[Path], output: Path) -> None:
    list_file = output.with_suffix(".concat.txt")
    with list_file.open("w", encoding="utf-8") as handle:
        for part in parts:
            escaped = str(part).replace("'", "'\\''")
            handle.write(f"file '{escaped}'\n")

    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "24000",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "96k",
            str(output),
        ],
        check=True,
    )


def generate_chapter(token: str, chapter_id: str, title: str, text: str, workdir: Path) -> Path:
    chunks = chunk_text(text)
    print(f"Generating {chapter_id}: {title} ({len(text)} chars, {len(chunks)} chunks)")
    chapter_dir = workdir / chapter_id
    chapter_dir.mkdir(parents=True, exist_ok=True)

    generated: list[Path] = []
    for index, chunk in enumerate(chunks, start=1):
        print(f"  TTS chunk {index}/{len(chunks)}")
        base = chapter_dir / f"part-{index:03d}.mp3"
        generated.append(generate_chunk(token, chunk, base))
        time.sleep(0.4)

    output = workdir / f"{chapter_id}.mp3"
    join_audio(generated, output)
    return output


def main() -> None:
    token = required_env("CLOUDFLARE_WORKERS_AI_TOKEN")
    s3 = r2_client()

    with tempfile.TemporaryDirectory(prefix="concurso-audiobook-") as temp:
        workdir = Path(temp)
        pdf_path = ensure_source_assets(s3, workdir)
        pages = extract_pages(pdf_path)
        chapter_texts = build_chapter_texts(pages)

        manifest = {
            "title": "Quem disse o quê? - Apostila de Autores - Banca IBAM",
            "author": "Margareth Almeida",
            "publicBase": PUBLIC_BASE,
            "pdf": f"{PUBLIC_BASE}/{PDF_KEY}",
            "cover": f"{PUBLIC_BASE}/{COVER_KEY}",
            "summary": f"{PUBLIC_BASE}/{SUMMARY_KEY}",
            "chapters": [],
        }

        for (chapter_id, title), text in zip(CHAPTERS, chapter_texts):
            key = f"audio/{chapter_id}.mp3"
            output = generate_chapter(token, chapter_id, title, text, workdir)
            upload_file(s3, output, key, "audio/mpeg")
            manifest["chapters"].append(
                {
                    "id": chapter_id,
                    "title": title,
                    "url": f"{PUBLIC_BASE}/{key}",
                    "bytes": output.stat().st_size,
                }
            )

        manifest_path = workdir / "audiobook-manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        s3.upload_file(
            str(manifest_path),
            BUCKET,
            MANIFEST_KEY,
            ExtraArgs={
                "ContentType": "application/json; charset=utf-8",
                "CacheControl": "public, max-age=300",
            },
        )

        print("Audiobook generation completed.")
        print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
