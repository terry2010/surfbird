# surfbird-mcp

MCP server for **[Surfbird](https://github.com/terry2010/surfbird)** — the unofficial self-hosted Docker distribution of [Cloudflare Kitesurf](https://github.com/cloudflare/kitesurf), a headless browser engine built for AI agents.

Exposes your own browser API as MCP tools — including **`surf_markdown` (article→clean markdown)** and **`surf_batch` (bulk fetch)** that stock browser MCPs don't have. No Chrome container, no cloud bill: any VPS running `terry2010/surfbird:auth` works.

## Configure

```json
{
  "mcpServers": {
    "surfbird": {
      "command": "npx",
      "args": ["-y", "surfbird-mcp"],
      "env": {
        "SURFBIRD_URL": "http://<your-vps>:8080",
        "SURFBIRD_TOKEN": "<token>"
      }
    }
  }
}
```

## Tools

| Tool | What it returns |
|---|---|
| `surf_markdown` | `{title, markdown, ...}` — article body via Readability+turndown |
| `surf_content` | `{title, url, html}` — full rendered DOM |
| `surf_screenshot` | PNG image (viewport/full-page) |
| `surf_pdf` | PDF resource (base64) |
| `surf_evaluate` | result of JS evaluated in page context |
| `surf_batch` | run markdown/content/evaluate over up to 20 urls in ONE call |
| `surf_health` | engine liveness check |

## Env

| Var | Default | Meaning |
|---|---|---|
| `SURFBIRD_URL` | `http://127.0.0.1:8080` | proxy base URL (auth) or `:8787` (raw) |
| `SURFBIRD_TOKEN` | — | Bearer token for auth images |
| `SURFBIRD_TIMEOUT_MS` | `120000` | per-tool timeout |

## Get a server

```bash
docker run -d -p 8080:8080 -e SURFBIRD_TOKEN=$(openssl rand -hex 24) terry2010/surfbird:auth
```

JS/TS client instead of MCP? → [`surfbird`](https://www.npmjs.com/package/surfbird)

Apache-2.0 · Not affiliated with Cloudflare · [GitHub](https://github.com/terry2010/surfbird)
