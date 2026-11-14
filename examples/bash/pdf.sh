#!/usr/bin/env bash
# Page → PDF
#   ./pdf.sh [url] [out.pdf] [landscape]
#   SURFBIRD_URL=... SURFBIRD_TOKEN=... ./pdf.sh
set -euo pipefail

URL="${1:-https://zhuikan.com/repos/terry2010__surfbird}"
OUT="${2:-page.pdf}"
LAND=false
[ "${3:-}" = "true" ] || [ "${3:-}" = "landscape" ] && LAND=true
BASE="${SURFBIRD_URL:-http://127.0.0.1:8080}"
TOKEN="${SURFBIRD_TOKEN:-}"

auth=()
[ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")

curl -sf -X POST "$BASE/pdf" \
  "${auth[@]}" -H 'content-type: application/json' \
  -d "$(jq -nc --arg url "$URL" --argjson land "$LAND" '{url:$url,landscape:$land}')" \
  -o "$OUT"

echo "wrote $OUT ($(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT") bytes)"
