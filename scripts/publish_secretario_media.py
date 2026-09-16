#!/usr/bin/env python3
"""Validate, synthesize and publish Secretário de Unidade Escolar study media to private R2.

The paid PDF and audio never become public web assets. The supplied summary audio is
transcoded to MP3; eight audiobook chapters are synthesized in Brazilian Portuguese
from the approved PDF using the repository's Piper voice pipeline.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
SLUG = "secretario-de-unidade-escolar-ibam-santos-2026"
DRAFT = ROOT / "products" / "secretario-product.draft.json"
SOURCES = ROOT / "products" / "secretario-media-sources.json"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_config():
    product = json.loads(DRAFT.read_text(encoding="utf-8"))[SLUG]
    spec = json.loads(SOURCES.read_text(encoding="utf-8"))[SLUG]
    return product, spec


def validate_png(path: Path, width: int, height: int) -> None:
    data = path.read_bytes()
    if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Cover is not a valid PNG signature")
    if data[12:16] != b"IHDR":
        raise RuntimeError("Cover PNG is missing IHDR")
    w, h, bit_depth, color_type, compression, filter_method, _ = struct.unpack(">IIBBBBB", data[16:29])
    if (w, h) != (width, height):
        raise RuntimeError(f"Unexpected cover dimensions: {w}x{h}; expected {width}x{height}")
    if bit_depth != 8 or color_type not in (4, 6):
        raise RuntimeError("Cover must be an 8-bit PNG with an alpha channel")
    if compression != 0 or filter_method != 0:
        raise RuntimeError("Unsupported PNG encoding")
    check = subprocess.run(["identify", "-regard-warnings", str(path)], capture_output=True, text=True)
    if check.returncode != 0:
        raise RuntimeError(f"Cover failed integrity check: {check.stderr.strip()}")


def media_duration(path: Path) -> float:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        capture_output=True, check=True, text=True,
    )
    duration = float(json.loads(proc.stdout)["format"]["duration"])
    if duration < 10:
        raise RuntimeError(f"Audio unexpectedly short: {path.name}")
    return duration


def decode_audio_check(path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-v", "error", "-xerror", "-i", str(path), "-f", "null", "-"],
        capture_output=True, check=True,
    )


def extract_pages(pdf: Path) -> list[str]:
    doc = fitz.open(str(pdf))
    try:
        pages = [page.get_text("text") or "" for page in doc]
    finally:
        doc.close()
    return pages


def clean_for_speech(text: str) -> str:
    # The PDF font maps the sequence "ti" to # in a few extracted words and
    # "tifi" to #$. Repair that deterministic encoding artifact before TTS.
    text = text.replace("\u00a0", " ").replace("#$", "tifi").replace("#", "ti")
    lines: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("TRILHA APROVA CONCURSOS"):
            continue
        if re.search(r"SECRETÁRIO DE UNIDADE ESCOLAR.*SANTOS 2026.*\d+\s*/\s*\d+", line, re.I):
            continue
        lines.append(line)
    text = "\n".join(lines)
    replacements = {
        "•": "; ", "→": "; ", "×": " vezes ", "÷": " dividido por ",
        "%": " por cento", "R$": " reais ", "≠": " diferente de ",
        "≥": " maior ou igual a ", "≤": " menor ou igual a ", "¬": " não ",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"(?m)^([ABCD])\)\s*", r"Alternativa \1: ", text)
    text = re.sub(r"(?m)^(\d{1,3})\.\s+", r"Item \1. ", text)
    acronyms = {
        r"\bIBAM\b": "Ibam", r"\bLGPD\b": "L G P D", r"\bLAI\b": "L A I",
        r"\bECA\b": "E C A", r"\bLDB\b": "L D B", r"\bLBI\b": "L B I",
        r"\bAEE\b": "A E E", r"\bLIMPE\b": "L I M P E",
    }
    for pattern, replacement in acronyms.items():
        text = re.sub(pattern, replacement, text)
    text = re.sub(r"\s*\+\s*", " mais ", text)
    text = re.sub(r"\s*=\s*", " é igual a ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if any(token in text for token in ["�", "#", "$#"]):
        raise RuntimeError("Suspicious extraction artifact detected; refusing to synthesize")
    return text


def prepare(source_dir: Path):
    product, spec = load_config()
    pdf = source_dir / spec["pdfFile"]
    cover = source_dir / spec["coverFile"]
    summary = source_dir / spec["summaryFile"]
    for path, digest in [
        (pdf, spec["pdfSha256"]),
        (cover, spec["coverSha256"]),
        (summary, spec["summarySha256"]),
    ]:
        if not path.is_file():
            raise RuntimeError(f"Missing source: {path.name}")
        actual = sha256_file(path)
        if actual != digest:
            raise RuntimeError(f"Source checksum mismatch: {path.name}: {actual}")

    validate_png(cover, spec["coverWidth"], spec["coverHeight"])
    summary_duration = media_duration(summary)
    decode_audio_check(summary)

    pages = extract_pages(pdf)
    if len(pages) != spec["pageCount"]:
        raise RuntimeError(f"Expected {spec['pageCount']} PDF pages, got {len(pages)}")

    ranges = [tuple(row) for row in spec["chapterRanges"]]
    if len(ranges) != len(product["assets"]["chapters"]) or len(ranges) != 8:
        raise RuntimeError("Exactly eight audiobook chapter ranges are required")
    covered = [page for first, last in ranges for page in range(first, last + 1)]
    excluded = set(spec["excludedPages"])
    expected_pages = [p for p in range(1, len(pages) + 1) if p not in excluded]
    if covered != expected_pages:
        raise RuntimeError("Chapter ranges must cover each substantive PDF page exactly once")

    chapter_texts = []
    for index, (chapter, (first, last)) in enumerate(zip(product["assets"]["chapters"], ranges), 1):
        body = clean_for_speech("\n".join(pages[first - 1:last]))
        if len(body) < 1200:
            raise RuntimeError(f"Chapter {index} has insufficient source text")
        intro = (
            f"Trilha Aprova. {product['shortName']}. "
            f"Capítulo {index}: {chapter['title']}. "
            "Este audiobook acompanha o conteúdo da apostila oficial do curso. "
            "Use a velocidade do player que for mais confortável para sua revisão.\n\n"
        )
        chapter_texts.append({
            **chapter,
            "pages": [first, last],
            "text": intro + body + "\n\nFim deste capítulo.",
        })
    return product, spec, pdf, cover, summary, summary_duration, chapter_texts


def transcode_summary(source: Path, target: Path) -> float:
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-vn", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k", str(target),
    ], check=True)
    decode_audio_check(target)
    duration = media_duration(target)
    if abs(duration - media_duration(source)) > 2.0:
        raise RuntimeError("Summary transcode duration changed unexpectedly")
    return duration


def publish(source_dir: Path):
    sys.path.insert(0, str(ROOT / "scripts"))
    import generate_audiobook as base
    import requests
    from botocore.exceptions import ClientError
    from piper import PiperVoice

    product, spec, pdf, cover, summary_source, summary_source_duration, chapters = prepare(source_dir)
    s3 = base.r2_client()

    def head(key: str):
        try:
            return s3.head_object(Bucket=base.BUCKET, Key=key)
        except ClientError as exc:
            if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") in (403, 404):
                return None
            raise

    def remote_sha(key: str) -> str:
        response = s3.get_object(Bucket=base.BUCKET, Key=key)
        h = hashlib.sha256()
        try:
            for chunk in response["Body"].iter_chunks(chunk_size=1024 * 1024):
                h.update(chunk)
        finally:
            response["Body"].close()
        return h.hexdigest()

    def upload_exact(path: Path, key: str, content_type: str, metadata=None):
        checksum = sha256_file(path)
        existing = head(key)
        if existing:
            if remote_sha(key) != checksum:
                raise RuntimeError(f"Refusing to overwrite different existing material: {key}")
        else:
            s3.upload_file(
                str(path), base.BUCKET, key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": "private, no-store",
                    "Metadata": {"sha256": checksum, **(metadata or {})},
                },
            )
        if remote_sha(key) != checksum:
            raise RuntimeError(f"R2 byte verification failed: {key}")
        print(f"VERIFIED {key} ({path.stat().st_size} bytes)", flush=True)
        return checksum

    upload_exact(pdf, product["assets"]["pdfKey"], "application/pdf")
    upload_exact(cover, product["assets"]["coverKey"], "image/png")

    manifest = {
        "slug": SLUG, "language": "pt-BR", "voice": base.VOICE_NAME,
        "pdfSha256": spec["pdfSha256"], "coverSha256": spec["coverSha256"], "tracks": [],
    }

    with tempfile.TemporaryDirectory(prefix="secretario-media-") as tmp:
        work = Path(tmp)
        summary_mp3 = work / "resumo.mp3"
        summary_duration = transcode_summary(summary_source, summary_mp3)
        summary_fingerprint = hashlib.sha256(
            (spec["summarySha256"] + "\nffmpeg-mp3-96k-mono-44100").encode()
        ).hexdigest()
        summary_sha = upload_exact(
            summary_mp3, product["assets"]["summary"]["key"], "audio/mpeg",
            {"source-sha256": summary_fingerprint, "original-sha256": spec["summarySha256"]},
        )
        manifest["tracks"].append({
            "id": "summary", "key": product["assets"]["summary"]["key"],
            "durationSeconds": round(summary_duration, 2), "sha256": summary_sha,
            "sourceSha256": summary_fingerprint,
            "sourceDurationSeconds": round(summary_source_duration, 2),
        })

        voice = None
        for chapter in chapters:
            key = chapter["key"]
            fingerprint = hashlib.sha256(
                (base.VOICE_NAME + "\n" + spec["pdfSha256"] + "\n" + chapter["text"]).encode()
            ).hexdigest()
            output = work / chapter["downloadName"]
            existing = head(key)
            if existing:
                metadata = existing.get("Metadata", {})
                if metadata.get("source-sha256") != fingerprint:
                    raise RuntimeError(f"Existing audio has unverified provenance: {key}")
                s3.download_file(base.BUCKET, key, str(output))
                if metadata.get("sha256") and sha256_file(output) != metadata["sha256"]:
                    raise RuntimeError(f"Existing audio checksum mismatch: {key}")
            else:
                if voice is None:
                    voice = PiperVoice.load(str(base.ensure_voice(work)))
                chunks = base.chunk_text(chapter["text"])
                wavs: list[Path] = []
                for n, chunk in enumerate(chunks):
                    wav = work / f"{chapter['id']}-{n:03d}.wav"
                    with wave.open(str(wav), "wb") as stream:
                        voice.synthesize_wav(chunk, stream)
                    wavs.append(wav)
                    if n % 10 == 0:
                        print(f"TTS {chapter['id']}: {n + 1}/{len(chunks)} chunks", flush=True)
                base.join_audio(wavs, output)
                for wav in wavs:
                    wav.unlink(missing_ok=True)
                words_per_second = len(chapter["text"].split()) / media_duration(output)
                if not 0.5 <= words_per_second <= 5.0:
                    raise RuntimeError(f"Implausible speech duration: {chapter['id']}")
                upload_exact(output, key, "audio/mpeg", {"source-sha256": fingerprint})

            decode_audio_check(output)
            duration = media_duration(output)
            checksum = sha256_file(output)
            url = s3.generate_presigned_url(
                "get_object", Params={"Bucket": base.BUCKET, "Key": key}, ExpiresIn=120
            )
            response = requests.get(url, headers={"Range": "bytes=0-31"}, timeout=30)
            if response.status_code != 206 or len(response.content) != 32:
                raise RuntimeError(f"Private range streaming failed: {key}")
            manifest["tracks"].append({
                "id": chapter["id"], "key": key, "pages": chapter["pages"],
                "durationSeconds": round(duration, 2), "sha256": checksum,
                "sourceSha256": fingerprint,
            })
            print(f"AUDIO VERIFIED {chapter['id']}: {duration:.2f}s; private byte range OK", flush=True)

        s3.put_object(
            Bucket=base.BUCKET, Key=f"{SLUG}/audio/manifest.json",
            Body=json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json", CacheControl="private, no-store",
        )
    print(f"COMPLETE {SLUG}: PDF, cover, summary and 8 audiobook chapters verified", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    product, spec, _, _, _, duration, chapters = prepare(args.source_dir)
    print(json.dumps({
        "slug": SLUG,
        "pdfPages": spec["pageCount"],
        "cover": {"width": spec["coverWidth"], "height": spec["coverHeight"], "sha256": spec["coverSha256"]},
        "summaryDurationSeconds": round(duration, 2),
        "chapterCount": len(chapters),
        "chapters": [{"id": x["id"], "pages": x["pages"], "characters": len(x["text"])} for x in chapters],
    }, ensure_ascii=False, indent=2))
    if not args.validate_only:
        publish(args.source_dir)


if __name__ == "__main__":
    main()
