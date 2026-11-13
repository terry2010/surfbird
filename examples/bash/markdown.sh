#!/usr/bin/env bash
# Extract article markdown via Surfbird.
#   SURFBIRD_URL=http://vps:8080 SURFBIRD_TOKEN=xxx ./markdown.sh https://zhuikan.com/repos/terry2010__surfbird [out.md]
set -euo pipefail

URL="${1:-}"
[ -n "$URL" ] || { echo "usage: $0 <url> [out.md]" >&2; exit 64; }
OUT="${2:--}"
BASE="${SURFBIRD_URL:-http://127.0.0.1:8080}"
TOKEN="${SURFBIRD_TOKEN:-}"

auth=()
[ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")

body=$(curl -sf -X POST "$BASE/markdown" \
  "${auth[@]}" -H 'content-type: application/json' \
  -d "{\"url\":\"$URL\"}") || { echo "request failed" >&2; exit 1; }

if [ "$OUT" = "-" ]; then
  printf '%s' "$body" | jq -r '.markdown // (.error.message // .)'
else
  printf '%s' "$body" | jq -r '"# \(.title)\n\n" + .markdown' > "$OUT"
  echo "$OUT written ($(wc -c < "$OUT" | tr -d ' ') bytes)" >&2
fi
