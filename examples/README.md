# Examples

Copy-paste clients for the Surfbird REST layer. Two env vars control everything:

```bash
export SURFBIRD_URL=http://<your-vps>:8080   # auth image port; raw uses :8787
export SURFBIRD_TOKEN=<token>              # leave unset for raw image
```

## Python (`examples/python/`)

Zero dependencies — stdlib only.

| Script | What it does |
|---|---|
| `surfbird.py` | Importable client class (`Surfbird`) — markdown/content/screenshot/pdf/evaluate/health |
| `article_to_markdown.py` | `python article_to_markdown.py <url> out.md` |
| `rss_to_markdown.py` | `python rss_to_markdown.py <feed-url> [N] digest.md` — feed → per-article markdown → combined digest (daily-news-report pattern) |

```bash
cd examples/python
python article_to_markdown.py https://example.com/post out.md
python rss_to_markdown.py https://www.ruanyifeng.com/blog/atom.xml 5 digest.md
```

## Bash (`examples/bash/`)

Needs `curl` + `jq`.

| Script | What it does |
|---|---|
| `markdown.sh` | `./markdown.sh <url> [out.md]` — article → markdown |
| `screenshot.sh` | `./screenshot.sh <url> [out.png] [full]` |
| `batch-markdown.sh` | `cat urls.txt \| ./batch-markdown.sh ./out` — sequential batch (respects the server concurrency cap) |

## Error codes worth handling

| HTTP | Meaning |
|---|---|
| 401 | missing/wrong `SURFBIRD_TOKEN` |
| 422 | `no_article` — Readability found nothing (SPA shell, non-article page) |
| 502 | engine error — target site unreachable/TLS/JS crash |
| 5xx slow | request queued behind `MAX_CONCURRENT_ACTIONS` — just wait, it isn't an error |
