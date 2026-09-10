#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/public/assets"
printf 'Static assets ready. Large PDFs and audiobooks are delivered through Vercel rewrites.\n'
