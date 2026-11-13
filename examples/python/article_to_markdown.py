#!/usr/bin/env python3
"""Fetch one article URL → clean markdown file.

    SURFBIRD_URL=http://vps:8080 SURFBIRD_TOKEN=xxx \
      python article_to_markdown.py https://zhuikan.com/repos/terry2010__surfbird out.md
"""
import os
import sys

from surfbird import Surfbird, SurfbirdError


def main() -> int:
    if len(sys.argv) < 2:
        sys.exit(__doc__.strip())
    url = sys.argv[1]
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
