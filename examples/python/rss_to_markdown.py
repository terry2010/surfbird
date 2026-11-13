#!/usr/bin/env python3
"""RSS/Atom feed → markdown digest, the pattern behind daily news reports.

Reads a feed (stdlib only), takes the newest N entries, extracts each article's
markdown through Surfbird, and writes one combined digest.md — the exact input
you'd feed an LLM for a daily summary.

    SURFBIRD_URL=http://vps:8080 SURFBIRD_TOKEN=xxx \
      python rss_to_markdown.py https://www.ruanyifeng.com/blog/atom.xml 5 digest.md
"""
import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

from surfbird import Surfbird, SurfbirdError

ATOM = "{http://www.w3.org/2005/Atom}"


def feed_entries(feed_url: str, limit: int) -> list[tuple[str, str]]:
    """Return [(title, link), ...] for RSS2 + Atom feeds."""
    raw = urllib.request.urlopen(feed_url, timeout=30).read()
    root = ET.fromstring(raw)
    items = []
    for it in root.iter(f"{ATOM}entry", "item"):
        title = (it.findtext("title") or it.findtext(f"{ATOM}title") or "").strip()
        link = it.findtext("link") or ""
        if not link:
            el = it.find(f"{ATOM}link")
            link = el.get("href", "") if el is not None else ""
        if title and link:
            items.append((title, link))
        if len(items) >= limit:
            break
    return items


def main() -> int:
    if len(sys.argv) < 2:
        sys.exit(__doc__.strip())
    feed_url = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    out = sys.argv[3] if len(sys.argv) > 3 else "digest.md"

    sb = Surfbird(
        os.environ.get("SURFBIRD_URL", "http://127.0.0.1:8080"),
        token=os.environ.get("SURFBIRD_TOKEN", ""),
    )
    if not sb.health():
        sys.exit("surfbird not reachable / engine unhealthy")

    entries = feed_entries(feed_url, limit)
    print(f"{len(entries)} entries from {feed_url}", file=sys.stderr)

    parts, ok = [], 0
    for title, link in entries:
        try:
            art = sb.markdown(link)
            body = re.sub(r"\n{3,}", "\n\n", art["markdown"]).strip()
            parts.append(f"## {art['title'] or title}\n\n{link}\n\n{body}\n")
            ok += 1
            print(f"  ok  {title[:60]}", file=sys.stderr)
        except SurfbirdError as e:
            parts.append(f"## {title}\n\n{link}\n\n_(extraction failed: {e.code})_\n")
            print(f"  err {title[:60]}  [{e.code}]", file=sys.stderr)
        time.sleep(0.5)  # be polite to both the engine and the sites

    digest = f"# Digest — {feed_url}\n\n" + "\n---\n\n".join(parts)
    with open(out, "w") as f:
        f.write(digest)
    print(f"{out}: {ok}/{len(entries)} extracted, {len(digest)} chars", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
