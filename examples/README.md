# Examples

Copy-paste clients for the Surfbird REST layer (auth image only — `raw` exposes the bare engine, no REST). Two env vars control everything:

```bash
export SURFBIRD_URL=http://<your-vps>:8080   # auth image — the only one with REST
export SURFBIRD_TOKEN=<token>               # required on auth images
```

## Python (`examples/python/`)

Zero dependencies — stdlib only.

| Script | What it does |
|---|---|
| `surfbird.py` | Importable client class (`Surfbird`) — markdown/content/source/screenshot/pdf/evaluate/health |
| `article_to_markdown.py` | `python article_to_markdown.py <url> out.md` |
| `source.py` | `python source.py <url> out.html` — "view source" HTML (original response, pre-JS) |
| `rss_to_markdown.py` | `python rss_to_markdown.py <feed-url> [N] digest.md` — feed → per-article markdown → combined digest (daily-news-report pattern) |
| `batch_markdown.py` | `python batch_markdown.py [urls.txt] [digest.md]` — ONE `POST /batch` call for ≤20 urls, per-item failures don't abort |

```bash
cd examples/python
python article_to_markdown.py https://zhuikan.com/repos/terry2010__surfbird out.md
python rss_to_markdown.py https://www.ruanyifeng.com/blog/atom.xml 5 digest.md
python batch_markdown.py urls.txt digest.md   # server-side batch via /batch
```

**`/batch` vs looping yourself:** `POST /batch` runs the whole list in one request, server-side sequential, and returns `[{url, ok, status, data|error}]` — partial failures come back as entries, not aborts. For lists > `MAX_BATCH_URLS` (20) or streaming progress, a client loop like `rss_to_markdown.py` / `batch-markdown.sh` is still the right tool.

## Bash (`examples/bash/`)

Needs `curl` + `jq`.

| Script | What it does |
|---|---|
| `markdown.sh` | `./markdown.sh [url] [out.md]` — article → markdown |
| `screenshot.sh` | `./screenshot.sh [url] [out.png] [full]` — PNG screenshot |
| `content.sh` | `./content.sh [url] [out.html]` — rendered DOM `{title,url,html}` |
| `source.sh` | `./source.sh [url] [out.html]` — "view source" HTML `{title,url,html}` |
| `pdf.sh` | `./pdf.sh [url] [out.pdf] [landscape]` — page → PDF |
| `evaluate.sh` | `./evaluate.sh [url] "document.title"` — JS in page context → `{result}` |
| `batch-markdown.sh` | `cat urls.txt \| ./batch-markdown.sh ./out` — client-side loop; for ≤20 urls prefer `/batch` (see `batch_markdown.py`) |

All scripts default to `https://zhuikan.com/repos/terry2010__surfbird` when no URL is given — that page is a SPA (use `/content`, `/screenshot` or `/evaluate`; `/markdown` needs article-shaped pages).

## Error codes worth handling

| HTTP | Meaning |
|---|---|
| 401 | missing/wrong `SURFBIRD_TOKEN` |
| 422 | `no_article` — Readability found nothing (SPA shell, non-article page) |
| 502 | engine error — target site unreachable/TLS/JS crash |
| 5xx slow | request queued behind `MAX_CONCURRENT_ACTIONS` — just wait, it isn't an error |
