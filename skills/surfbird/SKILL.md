---
name: surfbird
description: Use a running Surfbird (self-hosted Kitesurf browser engine) instance to fetch pages, extract article markdown, take screenshots, render PDFs, and run page JS — via plain REST, no MCP or CDP client required.
---

# Surfbird REST client

Surfbird exposes a small REST layer over a real browser engine. You only need `curl`.

## Setup

Environment (ask the user if unset):
- `SURFBIRD_URL` — e.g. `http://<vps>:8080` (auth image) or `http://<vps>:8787` (raw)
- `SURFBIRD_TOKEN` — bearer token for auth images

## Endpoints

| Method + path | Body | Returns |
|---|---|---|
| `POST /markdown` | `{"url"}` | `{title, markdown, byline, excerpt}` — article body as markdown (Readability+turndown). **Prefer this for articles** |
| `POST /content` | `{"url"}` | `{title, url, html}` — full rendered DOM |
| `POST /screenshot` | `{"url","width"?,"fullPage"?}` | PNG bytes |
| `POST /pdf` | `{"url","landscape"?}` | PDF bytes |
| `POST /evaluate` | `{"url","script"}` | `{result}` — JS evaluated in page context |
| `GET /health` | — | `ok` when engine is live (no auth needed) |

## Examples

```bash
# article → markdown
curl -s -X POST "$SURFBIRD_URL/markdown" \
  -H "Authorization: Bearer $SURFBIRD_TOKEN" -H 'content-type: application/json' \
  -d '{"url":"https://example.com/post"}' | jq -r .markdown

# screenshot
curl -s -X POST "$SURFBIRD_URL/screenshot" \
  -H "Authorization: Bearer $SURFBIRD_TOKEN" -H 'content-type: application/json' \
  -d '{"url":"https://example.com","fullPage":true}' -o page.png

# run JS (e.g. collect all links)
curl -s -X POST "$SURFBIRD_URL/evaluate" \
  -H "Authorization: Bearer $SURFBIRD_TOKEN" -H 'content-type: application/json' \
  -d '{"url":"https://example.com","script":"[...document.querySelectorAll(\"a\")].map(a=>a.href)"}'
```

## Notes

- Every request opens a fresh isolated page — no cookies/session carry over. For logged-in flows do the steps inside one `/evaluate` script.
- Requests are rate-limited server-side (`MAX_CONCURRENT_ACTIONS`, default 2) — serialize bulk fetches or expect queuing, not errors.
- Failures: `401` = bad/missing token, `502` = engine error (often TLS/network on the target site), `422` = Readability found no article (try `/content` and extract yourself).
- Engine limits (upstream, not fixable here): no video decode, no file downloads, no touch gestures, JS engine is Boa not V8 — exotic sites may mis-render.
