#!/usr/bin/env bash
# Extract article markdown via Surfbird.
#   SURFBIRD_URL=http://vps:8080 SURFBIRD_TOKEN=xxx ./markdown.sh https://zhuikan.com/repos/terry2010__surfbird [out.md]
set -euo pipefail

URL="${1:-https://zhuikan.com/repos/terry2010__surfbird}"
OUT="${2:--}"
BASE="${SURFBIRD_URL:-http://127.0.0.1:8080}"
TOKEN="${SURFBIRD_TOKEN:-}"

auth=()
[ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")

resp=$(curl -s -X POST "$BASE/markdown" \
  "${auth[@]}" -H 'content-type: application/json' \
  -w '\n%{http_code}' \
  -d "$(jq -nc --arg url "$URL" '{url:$url}')")
code=${resp##*$'\n'}
body=${resp%$'\n'*}

if [ "$code" != "200" ]; then
  msg=$(printf '%s' "$body" | jq -r '.error.message // .' 2>/dev/null)
  echo "HTTP $code: $msg" >&2
  exit 1
fi

if [ "$OUT" = "-" ]; then
  printf '%s' "$body" | jq -r '.markdown'
else
  printf '%s' "$body" | jq -r '"# \(.title)\n\n" + .markdown' > "$OUT"
  echo "$OUT written ($(wc -c < "$OUT" | tr -d ' ') bytes)" >&2
fi
