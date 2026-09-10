#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/public/assets"
rebuild () {
  local prefix="$1" out="$2"
  local parts=("$ROOT"/asset-parts/"$prefix".part.*)
  if [[ -e "${parts[0]}" ]]; then
    cat "${parts[@]}" | base64 --decode > "$ROOT/public/assets/$out"
  fi
}
rebuild pdf apostila-autores-ibam-santos-2026.pdf
rebuild audio como-desarmar-armadilhas-ibam.opus
rebuild cover apostila-autores-cover.png
printf 'Assets ready.\n'
