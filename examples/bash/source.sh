#!/usr/bin/env bash
# Original response body ("view source" HTML, pre-JS) → {title,url,html}
#   ./source.sh [url] [out.html]
#   SURFBIRD_URL=... SURFBIRD_TOKEN=... ./source.sh
set -euo pipefail

URL="${1:-https://example.com}"
OUT="${2:-}"
BASE="${SURFBIRD_URL:-http://127.0.0.1:8080}"
TOKEN="${SURFBIRD_TOKEN:-}"

auth=()
[ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")

resp=$(curl -s -X POST "$BASE/source" \
  "${auth[@]}" -H 'content-type: application/json' \
  -d "$(jq -nc --arg url "$URL" '{url:$url}')")

if [ -n "$OUT" ]; then
  printf '%s' "$resp" | jq -r '.html // .error.message' > "$OUT"
  echo "wrote $OUT"
else
  printf '%s' "$resp" | jq .
fi
