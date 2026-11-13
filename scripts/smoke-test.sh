#!/bin/bash
# Surfbird smoke test: build prebuilt ctx → docker build → run → verify.
# Usage: MODE=raw|auth KITESURF_DIR=/path/to/built/checkout ./scripts/smoke-test.sh
set -euo pipefail
MODE="${MODE:-raw}"
KITESURF_DIR="${KITESURF_DIR:-/root/kitesurf}"
CTX="${CTX:-/root/surfbird-ctx}"
PORT="${PORT:-8080}"
EPORT="${EPORT:-8787}"

echo "== staging ctx at $CTX =="
rm -rf "$CTX"; mkdir -p "$CTX/kitesurf"
# Docker COPY cannot follow symlinks out of context — materialize the tree
# via tar (skips the big/irrelevant dirs, keeps build artifacts in place).
tar -C "$KITESURF_DIR" \
    --exclude='*/node_modules' --exclude='*/.git' --exclude='./bazel-*' \
    -cf - . | tar -C "$CTX/kitesurf" -xf -
cp -r "$(dirname "$0")/../proxy" "$CTX/proxy"
cp "$(dirname "$0")/../entrypoint.sh" "$CTX/entrypoint.sh"
cp "$(dirname "$0")/../Dockerfile.prebuilt" "$CTX/Dockerfile.prebuilt"
cp "$(dirname "$0")/../Dockerfile.prebuilt.dockerignore" "$CTX/.dockerignore" 2>/dev/null || true

echo "== docker build (target: $MODE) =="
docker build -f "$CTX/Dockerfile.prebuilt" -t "surfbird:$MODE" "$CTX"

echo "== run =="
docker rm -f surfbird-test 2>/dev/null || true
if [ "$MODE" = "auth" ]; then
  TOKEN=$(openssl rand -hex 24)
  docker run -d --name surfbird-test -p "$PORT:8080" -e SURFBIRD_TOKEN="$TOKEN" -e SURFBIRD_MODE=auth "surfbird:$MODE"
  echo "TOKEN=$TOKEN"
else
  docker run -d --name surfbird-test -p "$EPORT:8787" -e SURFBIRD_MODE=raw "surfbird:$MODE"
fi

echo "== waiting for engine =="
for i in $(seq 1 60); do
  if [ "$MODE" = "auth" ]; then
    curl -sf -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  else
    curl -sf "http://127.0.0.1:$EPORT/health" >/dev/null 2>&1 && break
  fi
  sleep 5
done

echo "== logs =="
docker logs surfbird-test --tail 15
echo "== DONE. try: =="
if [ "$MODE" = "auth" ]; then
  echo "curl -H 'Authorization: Bearer \$TOKEN' -d '{\"url\":\"https://example.com\"}' http://127.0.0.1:$PORT/screenshot -o /tmp/page.png"
else
  echo "curl http://127.0.0.1:$EPORT/json/version"
fi
