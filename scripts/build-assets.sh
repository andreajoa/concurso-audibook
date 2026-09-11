#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/public/assets"
printf 'Static shell ready. PDF, cover and audiobook media are delivered directly from Cloudflare R2.\n'
