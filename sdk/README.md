# surfbird

Zero-dependency JS/TS client for **[Surfbird](https://github.com/terry2010/surfbird)** — the unofficial self-hosted Docker distribution of [Cloudflare Kitesurf](https://github.com/cloudflare/kitesurf), a headless browser engine built for AI agents.

Turn any VPS into a browser API: article→markdown extraction (Readability+turndown), rendered DOM, PNG screenshots, PDFs, page-context JS evaluation, and sequential batch fetching — over 6 tiny REST endpoints.

```bash
npm install surfbird
```

```js
import { Surfbird } from "surfbird";

const sb = new Surfbird("http://vps:8080", { token: process.env.SURFBIRD_TOKEN });

// article → clean markdown (the RSS-digest / LLM-summarizer path)
const { title, markdown } = await sb.markdown("https://blog.example.com/post");

// rendered DOM / binary output
const { html } = await sb.content("https://spa.example.com");
const png = await sb.screenshot(url, { fullPage: true });
const pdf = await sb.pdf(url);

// run JS inside the page
const links = await sb.evaluate(url, `[...document.querySelectorAll("a")].map(a=>a.href)`);

// many urls, one call — sequential server-side, failures don't abort the batch
const results = await sb.batch("markdown", [url1, url2, url3]);
// → [{url, ok:true, status:200, data:{...}}, {url, ok:false, status:422, error:"no_article"}]
```

## API

| Method | Returns |
|---|---|
| `sb.markdown(url)` | `{title, byline, excerpt, url, markdown}` (throws `SurfbirdError` status 422 when no article) |
| `sb.content(url)` | `{title, url, html}` |
| `sb.screenshot(url, {width, height, fullPage})` | PNG `Buffer` |
| `sb.pdf(url, {landscape, format})` | PDF `Buffer` |
| `sb.evaluate(url, script)` | JSON-serializable result |
| `sb.batch(action, urls, {timeout})` | `[{url, ok, status, data\|error}]` (action: markdown/content/evaluate/screenshot/pdf) |
| `sb.health()` | `boolean` |
| `sb.openapi()` | server's OpenAPI JSON |

Env vars used by examples: `SURFBIRD_URL`, `SURFBIRD_TOKEN`.

## Get a server

```bash
docker run -d -p 8080:8080 -e SURFBIRD_TOKEN=$(openssl rand -hex 24) terry2010/surfbird:auth
```

MCP instead of a client lib? → [`surfbird-mcp`](https://www.npmjs.com/package/surfbird-mcp)

Apache-2.0 · Not affiliated with Cloudflare · [GitHub](https://github.com/terry2010/surfbird)
