#!/usr/bin/env bash
# Evaluate a JS expression in page context → {result}
#   ./evaluate.sh [url] "document.title"
#   ./evaluate.sh "https://zhuikan.com/repos/terry2010__surfbird" '[...document.querySelectorAll("a")].length'
#   SURFBIRD_URL=... SURFBIRD_TOKEN=... ./evaluate.sh
set -euo pipefail

URL="${1:-https://zhuikan.com/repos/terry2010__surfbird}"
SCRIPT="${2:-document.title}"
BASE="${SURFBIRD_URL:-http://127.0.0.1:8080}"
TOKEN="${SURFBIRD_TOKEN:-}"

auth=()
[ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")

jq -nc --arg url "$URL" --arg script "$SCRIPT" '{url:$url,script:$script}' \
| curl -sS -X POST "$BASE/evaluate" \
    "${auth[@]}" -H 'content-type: application/json' \
    -d @- \
| jq '.result // .error // .'
