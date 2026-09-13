#!/usr/bin/env python3
"""Generate the Redação Ensino Fundamental audiobook using the same Piper/R2 pipeline as the first apostila."""
from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

from pypdf import PdfReader

import generate_audiobook as base

PRODUCT_SLUG = "redacao-nivel-fundamental-2026"
PDF_KEY = "redacao-nivel-fundamental-2026/docs/redacao-ensino-fundamental-completo-2026.pdf"
COVER_KEY = "redacao-nivel-fundamental-2026/images/redacao-nivel-fundamental-2026-capa.png"
SUMMARY_KEY = f"{PRODUCT_SLUG}/audio/resumo.mp3"
MANIFEST_KEY = f"{PRODUCT_SLUG}/audio/manifest.json"
AUDIO_PREFIX = f"{PRODUCT_SLUG}/audio/pt-br-v1"

CHAPTERS = [
    ("01-antes-de-escrever-metodo-universal", "Antes de escrever + Método universal", 1, 3),
    ("02-construcao-dissertacao-expositiva", "Construção do texto + Dissertação expositiva", 4, 5),
    ("03-argumentacao-narracao-relato", "Dissertação argumentativa + Narração e relato", 6, 7),
    ("04-textos-funcionais-gramatica", "Carta, e-mail, textos funcionais + Gramática", 8, 9),
    ("05-coesao-clareza-planejamento", "Coesão, clareza e planejamento", 10, 11),
    ("06-erros-frequentes-exercicios", "Erros frequentes + Questões de fixação", 12, 14),
    ("07-treino-pratico", "Treino prático - Produção textual", 15, 16),
    ("08-gabarito-modelos-revisao", "Gabarito, modelos de resposta + revisão final", 17, 19),
]


def extract_pages(pdf_path: Path) -> list[str]:
    pages = [(page.extract_text() or "") for page in PdfReader(str(pdf_path)).pages]
    if len(pages) != 19 or any(not page.strip() for page in pages):
        raise RuntimeError(f"Expected 19 readable pages, got {len(pages)}")
    return pages


def clean(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("•", " - ").replace("☐", "")
    text = re.sub(r"Reda[cç][aã]o\s+para\s+Concursos\s*\|\s*Ensino\s+Fundamental\s+Completo\s*[•\-]?\s*\d+", "", text, flags=re.I)
    text = re.sub(r"(?m)^\s*_+(?:\s*_+)*\s*$", "", text)
    text = re.sub(r"(?m)^\s*Resposta:\s*_+\s*$", "Resposta em branco.", text, flags=re.I)
    text = re.sub(r"(?m)^([ABCD])\)\s*", r"Alternativa \1: ", text)
    text = re.sub(r"(?m)^(\d{1,2})\.\s+", r"Questão \1. ", text)
    text = text.replace("→", "; ")
    text = re.sub(r"\bIBAM\b", "Ibam", text, flags=re.I)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chapter_texts(pages: list[str]) -> list[str]:
    texts = []
    for number, (_, title, first, last) in enumerate(CHAPTERS, start=1):
        body = clean("\n\n".join(pages[first - 1:last]))
        opening = (
            f"Sala de Estudos Margareth Almeida. Capítulo {number}: {title}. "
            "Este áudio está em português brasileiro. Acompanhe com atenção e use a velocidade do player para revisar.\n\n"
        )
        texts.append(opening + body + "\n\nFim deste capítulo.")
    return texts


def main() -> None:
    s3 = base.r2_client()
    force = os.environ.get("FORCE_REGENERATE", "") == "1"
    with tempfile.TemporaryDirectory(prefix="redacao-audiobook-") as temp:
        work = Path(temp)
        pdf = work / "redacao.pdf"
        if not base.object_exists(s3, PDF_KEY):
            raise RuntimeError(f"Missing source PDF in R2: {PDF_KEY}")
        if not base.object_exists(s3, SUMMARY_KEY):
            raise RuntimeError(f"Missing summary audio in R2: {SUMMARY_KEY}")
        s3.download_file(base.BUCKET, PDF_KEY, str(pdf))

        if not base.object_exists(s3, COVER_KEY):
            cover = work / "capa.png"
            base.render_cover(pdf, cover)
            base.upload_file(s3, cover, COVER_KEY, "image/png")

        pages = extract_pages(pdf)
        texts = chapter_texts(pages)
        needs_tts = force or any(not base.object_exists(s3, f"{AUDIO_PREFIX}/{row[0]}.mp3") for row in CHAPTERS)
        model = base.ensure_voice(work) if needs_tts else None

        manifest = {
            "slug": PRODUCT_SLUG,
            "title": "Redação para Concursos - Ensino Fundamental Completo",
            "author": "Margareth Almeida",
            "language": "pt-BR",
            "voice": base.VOICE_NAME,
            "pdfKey": PDF_KEY,
            "coverKey": COVER_KEY,
            "summaryKey": SUMMARY_KEY,
            "chapters": [],
        }

        for index, ((chapter_id, title, first, last), text) in enumerate(zip(CHAPTERS, texts), start=1):
            key = f"{AUDIO_PREFIX}/{chapter_id}.mp3"
            if force or not base.object_exists(s3, key):
                output = base.generate_chapter(model, chapter_id, title, text, work)
                base.upload_file(s3, output, key, "audio/mpeg")
                size = output.stat().st_size
            else:
                size = int(s3.head_object(Bucket=base.BUCKET, Key=key).get("ContentLength", 0))
                print(f"Chapter already exists, skipping: {key}")
            manifest["chapters"].append({"id": f"c{index}", "title": title, "pages": [first, last], "key": key, "bytes": size})

        out = work / "audiobook-manifest-pt-br-v1.json"
        out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        s3.upload_file(str(out), base.BUCKET, MANIFEST_KEY, ExtraArgs={"ContentType": "application/json; charset=utf-8", "CacheControl": "private, max-age=300"})
        print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
