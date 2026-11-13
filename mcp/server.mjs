#!/usr/bin/env node
// surfbird-mcp — thin MCP stdio server exposing Surfbird's REST actions as tools.
// No browser code here: every tool is one POST to the Surfbird proxy, which owns
// the CDP plumbing. Auth is a Bearer header — works against both raw (token-less)
// and auth images.
//
// Env:
//   SURFBIRD_URL         base URL (default http://127.0.0.1:8080)
//   SURFBIRD_TOKEN       bearer token for auth images
//   SURFBIRD_TIMEOUT_MS  per-tool timeout (default 120000 — same as the proxy's)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.SURFBIRD_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const TOKEN = process.env.SURFBIRD_TOKEN || "";
const TIMEOUT = Number(process.env.SURFBIRD_TIMEOUT_MS || 120_000);

const headers = () => ({
  "content-type": "application/json",
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
});

async function call(action, body) {
  const res = await fetch(`${BASE}/${action}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`surfbird /${action} → HTTP ${res.status} ${detail}`.slice(0, 600));
  }
  return res;
}

const text = (s) => ({ content: [{ type: "text", text: s }] });
const jsonResult = async (p) => text(JSON.stringify(await p.json(), null, 2));
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e?.message || e) }] });

const urlShape = { url: z.string().url().describe("page URL to visit") };

const server = new McpServer({ name: "surfbird", version: "0.1.0" });

server.tool(
  "surf_markdown",
  "Fetch a page and return the article body as clean markdown (Readability + turndown). Best for articles, docs, blogs.",
  urlShape,
  async ({ url }) => {
    try { return await jsonResult(await call("markdown", { url })); }
    catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_content",
  "Fetch a page and return {title, url, html} — the full rendered DOM after JS execution.",
  urlShape,
  async ({ url }) => {
    try { return await jsonResult(await call("content", { url })); }
    catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_screenshot",
  "Render a page and return a PNG screenshot.",
  {
    ...urlShape,
    width: z.number().int().min(100).max(4096).default(1280).optional(),
    height: z.number().int().min(100).max(4096).default(720).optional(),
    fullPage: z.boolean().default(false).optional(),
  },
  async (args) => {
    try {
      const res = await call("screenshot", args);
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      return { content: [{ type: "image", data: b64, mimeType: "image/png" }] };
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_pdf",
  "Render a page and return it as a PDF document (base64).",
  {
    ...urlShape,
    landscape: z.boolean().default(false).optional(),
    format: z.string().default("A4").optional(),
  },
  async (args) => {
    try {
      const res = await call("pdf", args);
      const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      return {
        content: [{
          type: "resource",
          resource: { uri: `${args.url.replace(/\W+/g, "_").slice(0, 60)}.pdf`, mimeType: "application/pdf", blob: b64 },
        }],
      };
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_evaluate",
  "Open a page and evaluate a JavaScript expression in its context. Returns the JSON-serializable result. Example: 'document.querySelectorAll(\"a\").length'.",
  {
    ...urlShape,
    script: z.string().describe("JS expression/function evaluated in page context"),
  },
  async ({ url, script }) => {
    try { return await jsonResult(await call("evaluate", { url, script })); }
    catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_health",
  "Check whether the Surfbird engine is up.",
  {},
  async () => {
    try {
      const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(10_000) });
      return text(`surfbird ${res.ok ? "healthy" : `unhealthy (${res.status})`} @ ${BASE}`);
    } catch (e) { return fail(e); }
  },
);

await server.connect(new StdioServerTransport());
console.error(`[surfbird-mcp] ready → ${BASE}${TOKEN ? " (auth on)" : ""}`);
