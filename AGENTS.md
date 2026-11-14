# AGENTS.md — repo guide for coding agents

Unofficial self-hosted Docker distribution of Cloudflare Kitesurf. See README.md.

## Layout

- `Dockerfile` — full multi-stage build (`raw`/`auth` targets); `Dockerfile.prebuilt` for prebuilt engine trees
- `proxy/index.mjs` — auth + REST proxy (all endpoint logic lives here)
- `entrypoint.sh` — container process supervision (raw=engine only, auth=engine+proxy)
- `mcp/server.mjs` — thin MCP stdio server wrapping the REST actions
- `skills/surfbird/SKILL.md` — agent-facing REST usage doc
- `examples/` — python + bash clients
- `scripts/ci-smoke.sh` — container smoke test (used by CI); `scripts/smoke-test.sh` — local prebuilt image test
- `upstream-tag.txt` — last released upstream kitesurf tag (CI-managed)
- `scripts/metrics.mjs` — daily npm/Docker Hub stats → `metrics/data.jsonl` + `dashboard.md` (both CI-managed)
- `bazel-downloader.cfg` — optional China-mirror URL rewrites (`--build-arg MIRRORS=1`)
- `docs/` is gitignored — local notes only, never commit it

## Rules

- **Never cut a release/tag/npm-publish without the user's explicit confirmation of version + changelog.**
- Keep `KITESURF_REF` pinned to a commit/tag; never default to `main`.
- Patches in `patches/` must apply cleanly (`git apply --check`); a failed patch fails the build. `patches/*.patch` is gitignored — patches are a local-only escape hatch, not for committing.
- No auth bypasses: auth mode must fail closed when `SURFBIRD_TOKEN` is empty.
- Engine has no `/health` route — probe `/json/version` instead.
- Turndown runs in the proxy (Node), NOT in-page — Boa's DOM shim breaks it.
- Container ports must never bind `0.0.0.0` in examples/docs unless explicitly requested — use `127.0.0.1` bindings.

## Verify

- `bash -n` all shell scripts; `node --check` JS.
- Full check: `bash scripts/ci-smoke.sh <image>` against a locally built image.
- CI: `.github/workflows/release.yml` — daily upstream-tag watch → build → smoke → push; `metrics.yml` — daily stats → commits `dashboard.md`.
