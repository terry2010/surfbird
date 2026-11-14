#!/bin/bash
set -e
cd /app/kitesurf/packages/engine

# workerd inspector is a full worker-context CDP debug port — debugging aid
# only, off by default in production (SURFBIRD_INSPECTOR=1 to enable).
WRANGLER_ARGS="--env local -c wrangler.jsonc -c test/fixtures-worker/wrangler.jsonc --port 8787"
[ "${SURFBIRD_INSPECTOR:-0}" = "1" ] && WRANGLER_ARGS="$WRANGLER_ARGS --inspector-port 9229"

if [ "${SURFBIRD_MODE:-raw}" = "auth" ]; then
  npx wrangler dev $WRANGLER_ARGS --ip 127.0.0.1 &
  ENGINE_PID=$!
  ENGINE_HOST=127.0.0.1 ENGINE_PORT=8787 node /app/proxy/index.mjs &
  PROXY_PID=$!
  # forward docker stop to both children so they can exit cleanly
  trap 'kill $ENGINE_PID $PROXY_PID 2>/dev/null' TERM INT
  # whichever dies first takes the container down; docker restart policy recovers
  wait -n $ENGINE_PID $PROXY_PID || true
  kill $ENGINE_PID $PROXY_PID 2>/dev/null || true
  exit 1
else
  exec npx wrangler dev $WRANGLER_ARGS --ip 0.0.0.0
fi
