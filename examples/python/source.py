#!/usr/bin/env python3
"""Fetch the ORIGINAL response HTML ("view source", pre-JS) for a URL → file.
Compare with /content's post-JS rendered DOM when debugging page scripts.

    SURFBIRD_URL=http://vps:8080 SURFBIRD_TOKEN=xxx \
      python source.py [url] [out.html]
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
        page = sb.source(url)
    except SurfbirdError as e:
        sys.exit(f"failed: {e}")

    html = page.get("html", "")
    if out == "-":
        print(html)
    else:
        with open(out, "w") as f:
            f.write(html)
        print(f"{out}  ({len(html)} chars, title: {page.get('title')!r})",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
