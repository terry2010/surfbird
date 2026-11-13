"""Minimal Surfbird REST client — stdlib only, zero dependencies.

Usage:
    from surfbird import Surfbird
    sb = Surfbird("http://vps:8080", token="...")
    article = sb.markdown("https://example.com/post")
"""
from __future__ import annotations

import json
import urllib.request
import urllib.error


class SurfbirdError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message
        super().__init__(f"HTTP {status} {code}: {message}")


class Surfbird:
    def __init__(self, base: str = "http://127.0.0.1:8080", token: str = "", timeout: int = 120):
        self.base = base.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _post(self, action: str, payload: dict):
        req = urllib.request.Request(
            f"{self.base}/{action}",
            data=json.dumps(payload).encode(),
            headers={
                "content-type": "application/json",
                **({"authorization": f"Bearer {self.token}"} if self.token else {}),
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                return r.read(), r.headers.get("content-type", "")
        except urllib.error.HTTPError as e:
            try:
                body = json.loads(e.read()).get("error", {})
            except Exception:
                body = {}
            raise SurfbirdError(e.code, body.get("code", "http_error"), body.get("message", e.reason))

    def health(self) -> bool:
        try:
            with urllib.request.urlopen(f"{self.base}/health", timeout=10) as r:
                return r.status == 200
        except Exception:
            return False

    def markdown(self, url: str) -> dict:
        """→ {title, byline, excerpt, url, markdown}; raises SurfbirdError(422) if no article."""
        data, _ = self._post("markdown", {"url": url})
        return json.loads(data)

    def content(self, url: str) -> dict:
        """→ {title, url, html} — full rendered DOM."""
        data, _ = self._post("content", {"url": url})
        return json.loads(data)

    def screenshot(self, url: str, path: str, width: int = 1280, height: int = 720, full_page: bool = False) -> str:
        data, _ = self._post("screenshot", {"url": url, "width": width, "height": height, "fullPage": full_page})
        with open(path, "wb") as f:
            f.write(data)
        return path

    def pdf(self, url: str, path: str, landscape: bool = False) -> str:
        data, _ = self._post("pdf", {"url": url, "landscape": landscape})
        with open(path, "wb") as f:
            f.write(data)
        return path

    def evaluate(self, url: str, script: str):
        data, _ = self._post("evaluate", {"url": url, "script": script})
        return json.loads(data).get("result")
