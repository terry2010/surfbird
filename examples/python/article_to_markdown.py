#!/usr/bin/env python3
"""Fetch one article URL → clean markdown file. No arg → the default demo page.

    SURFBIRD_URL=http://vps:8080 SURFBIRD_TOKEN=xxx \
      python article_to_markdown.py [url] [out.md]
"""
import os
import sys

from surfbird import Surfbird, SurfbirdError

DEFAULT_URL = "https://zhuikan.com/repos/terry2010__surfbird"


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    out = sys.argv[2] if len(sys.argv) > 2 else "-"

    sb = Surfbird(
        os.environ.get("SURFBIRD_URL", "http://127.0.0.1:8080"),
        token=os.environ.get("SURFBIRD_TOKEN", ""),
    )
    if not sb.health():
        sys.exit("surfbird not reachable / engine unhealthy")

    try:
        art = sb.markdown(url)
    except SurfbirdError as e:
        sys.exit(f"{e.code}: {e.message}" if e.code == "no_article"
                 else f"failed: {e}")

    text = f"# {art['title']}\n\n{art['markdown']}\n"
    if out == "-":
        print(text)
    else:
        with open(out, "w") as f:
            f.write(text)
        print(f"{out}  ({len(text)} chars, title: {art['title']!r})", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
