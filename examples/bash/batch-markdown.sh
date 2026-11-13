#!/usr/bin/env bash
# Batch: one URL per line from stdin (or a file arg) → outdir/<slug>.md
# Honors the proxy's concurrency cap — runs strictly sequentially.
#   cat urls.txt | SURFBIRD_URL=... SURFBIRD_TOKEN=... ./batch-markdown.sh ./out
set -euo pipefail

OUTDIR="${1:-./out}"
SRC="${2:--}"
BASE="${SURFBIRD_URL:-http://127.0.0.1:8080}"
TOKEN="${SURFBIRD_TOKEN:-}"

auth=()
[ -n "$TOKEN" ] && auth=(-H "Authorization: Bearer $TOKEN")

mkdir -p "$OUTDIR"
ok=0; fail=0
while IFS= read -r url; do
  [ -z "$url" ] && continue
  slug=$(printf '%s' "$url" | sed 's|[^a-zA-Z0-9]|_|g' | cut -c1-80)
  if curl -sf -X POST "$BASE/markdown" \
      "${auth[@]}" -H 'content-type: application/json' \
      -d "{\"url\":\"$url\"}" \
    | jq -r '"# \(.title)\n\n" + .markdown' > "$OUTDIR/$slug.md" 2>/dev/null; then
    ok=$((ok+1)); echo "ok  $url"
  else
    fail=$((fail+1)); rm -f "$OUTDIR/$slug.md"; echo "err $url" >&2
  fi
  sleep 0.5
done < "$SRC"

echo "done: $ok ok, $fail failed → $OUTDIR" >&2
[ "$fail" -eq 0 ]
