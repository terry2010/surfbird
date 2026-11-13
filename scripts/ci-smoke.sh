#!/usr/bin/env bash
# Surfbird CI smoke test: start a container, wait for readiness, then have the
# engine visit a set of real sites via the REST layer. Passes when at least
# N-1 of N URLs succeed (default: 2 of 3).
#
# Usage: scripts/ci-smoke.sh <image-ref> [url ...]
set -u

IMAGE="${1:?usage: ci-smoke.sh <image> [url ...]}"
shift
URLS=("$@")
if [ "${#URLS[@]}" -eq 0 ]; then
  URLS=("https://www.google.com" "https://zhuikan.com/repos/terry2010__surfbird" "https://www.cloudflare.com")
fi
NEED=$(( ${#URLS[@]} - 1 ))
[ "$NEED" -lt 1 ] && NEED=1

NAME="surfbird-ci-$$"
PORT=18080
TOKEN="ci-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "== starting $IMAGE (auth) on :$PORT"
docker run -d --name "$NAME" \
  -e SURFBIRD_TOKEN="$TOKEN" \
  -e SURFBIRD_MODE=auth \
  -p 127.0.0.1:${PORT}:8080 \
  "$IMAGE" >/dev/null

echo "== waiting for /health"
healthy=""
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 3
done
if [ -z "$healthy" ]; then
  echo "FAIL: engine never became healthy"
  docker logs "$NAME" 2>&1 | tail -40
  exit 1
fi
echo "   healthy"

echo "== auth gate"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT}/content" \
  -H 'content-type: application/json' -d '{"url":"https://www.cloudflare.com"}')
echo "   no-token /content → $code (expect 401)"
[ "$code" = 401 ] || { echo "FAIL: unauthenticated request was not rejected"; exit 1; }

echo "== site visits via POST /content (need ${NEED}/${#URLS[@]} ok)"
ok=0
for u in "${URLS[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 120 -X POST "http://127.0.0.1:${PORT}/content" \
    -H "Authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
    -d "{\"url\":\"${u}\"}")
  echo "   ${u} → ${code}"
  [ "$code" = 200 ] && ok=$((ok + 1))
done

# /markdown pipeline: Readability (in-page) + turndown (proxy-side).
# 200 = article extracted; 422 = no article — both prove the pipeline works.
echo "== markdown pipeline (/markdown on first URL)"
mcode=$(curl -s -o /dev/null -w '%{http_code}' -m 120 -X POST "http://127.0.0.1:${PORT}/markdown" \
  -H "Authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d "{\"url\":\"${URLS[0]}\"}")
echo "   ${URLS[0]} → ${mcode} (expect 200 or 422)"
[ "$mcode" = 200 ] || [ "$mcode" = 422 ] || { echo "FAIL: markdown pipeline broken"; docker logs "$NAME" 2>&1 | tail -20; exit 1; }

# /batch: one call over all urls → array with per-item ok flags
echo "== batch endpoint (/batch content over all urls)"
ujson=$(printf ',"%s"' "${URLS[@]}")
bresp=$(curl -s -m 240 -X POST "http://127.0.0.1:${PORT}/batch" \
  -H "Authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d "{\"action\":\"content\",\"urls\":[${ujson:1}]}")
bcode=$(printf '%s' "$bresp" | python3 -c "import json,sys; r=json.load(sys.stdin); print(sum(1 for x in r if x.get('ok')))" 2>/dev/null || echo 0)
echo "   batch ok count: ${bcode}/${#URLS[@]}"
[ "$bcode" -ge 1 ] || { echo "FAIL: batch endpoint broken"; printf '%s' "$bresp" | head -c 400; exit 1; }

echo "== ${ok}/${#URLS[@]} ok (need ${NEED})"
if [ "$ok" -lt "$NEED" ]; then
  echo "FAIL"; docker logs "$NAME" 2>&1 | tail -20
  exit 1
fi
echo "PASS"
