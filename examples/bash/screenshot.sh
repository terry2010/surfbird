#!/usr/bin/env bash
# Screenshot a page via Surfbird.
#   SURFBIRD_URL=http://vps:8080 SURFBIRD_TOKEN=xxx ./screenshot.sh https://zhuikan.com/repos/terry2010__surfbird page.png [full]
set -euo pipefail

URL="${1:-}"
[ -n "$URL" ] || { echo "usage: $0 <url> [out.png] [full]" >&2; exit 64; }
OUT="${2:-page.png}"
FULL="${3:-}"
BASE="${SURFBIRD_URL:-http://127.0.0.1:8080}"
TOKEN="${SURFBIRD_TOKEN:-}"

auth=()
[ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")

fullPage=false
[ "$FULL" = "full" ] && fullPage=true

curl -sf -X POST "$BASE/screenshot" \
  "${auth[@]}" -H 'content-type: application/json' \
  -d "{\"url\":\"$URL\",\"fullPage\":$fullPage,\"width\":1280,\"height\":720}" \
  -o "$OUT"

echo "$OUT ($(file -b "$OUT" | cut -d, -f1))"
