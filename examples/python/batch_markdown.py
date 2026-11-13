#!/usr/bin/env python3
"""Server-side batch: ONE POST /batch call → digest.md

Unlike a client-side loop, the proxy runs each url through its
MAX_CONCURRENT_ACTIONS gate and returns per-item ok/status/error —
partial failures don't abort the batch.

  python3 batch_markdown.py [urls.txt] [digest.md]
  (urls.txt: one URL per line; no file → demo urls)

Env: SURFBIRD_URL (default http://127.0.0.1:8080), SURFBIRD_TOKEN
"""
import json, os, sys, urllib.request

BASE = os.environ.get("SURFBIRD_URL", "http://127.0.0.1:8080").rstrip("/")
TOKEN = os.environ.get("SURFBIRD_TOKEN", "")

DEMO = [
    "https://www.ruanyifeng.com/blog/2025/11/weekly-issue-373.html",
    "https://zhuikan.com/repos/terry2010__surfbird",
]

def batch(urls, action="markdown"):
    req = urllib.request.Request(
        f"{BASE}/batch",
        data=json.dumps({"action": action, "urls": urls}).encode(),
        headers={
            "content-type": "application/json",
            **({"authorization": f"Bearer {TOKEN}"} if TOKEN else {}),
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120 * len(urls)) as r:
        return json.loads(r.read())

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    out = sys.argv[2] if len(sys.argv) > 2 else "digest.md"
    urls = [l.strip() for l in open(src) if l.strip()] if src else DEMO
    print(f"POST /batch markdown × {len(urls)} urls → {BASE}")
    results = batch(urls)
    ok = 0
    with open(out, "w") as f:
        for item in results:
            if item["ok"]:
                ok += 1
                d = item["data"]
                f.write(f"# {d.get('title') or item['url']}\n\n{d.get('markdown', '')}\n\n---\n\n")
            else:
                print(f"  ✗ {item['url']}  → {item['status']} {item.get('error')}", file=sys.stderr)
    print(f"done: {ok}/{len(results)} ok → {out}")

if __name__ == "__main__":
    main()
