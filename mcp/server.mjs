#!/usr/bin/env node
// surfbird-mcp — thin MCP stdio server exposing Surfbird's REST actions as tools.
// No browser code here: every tool is one POST to the Surfbird proxy, which owns
// the CDP plumbing. The REST layer only exists on the auth image (raw exposes
// just the engine: CDP + /json/* + /rbi/*); SURFBIRD_TOKEN is the Bearer header.
//
// Env:
//   SURFBIRD_URL         base URL (default http://127.0.0.1:8080)
//   SURFBIRD_TOKEN       bearer token for auth images
//   SURFBIRD_TIMEOUT_MS  per-tool timeout (default 120000 — same as the proxy's)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Surfbird } from "surfbird";

const BASE = (process.env.SURFBIRD_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const TOKEN = process.env.SURFBIRD_TOKEN || "";
const TIMEOUT = Number(process.env.SURFBIRD_TIMEOUT_MS || 120_000);

const sb = new Surfbird(BASE, { token: TOKEN, timeout: TIMEOUT });

const text = (s) => ({ content: [{ type: "text", text: s }] });
const jsonResult = async (p) => text(JSON.stringify(await p, null, 2));
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e?.message || e) }] });

const urlShape = { url: z.url().describe("page URL to visit") };

const server = new McpServer({ name: "surfbird", version: "0.1.0" });

server.tool(
  "surf_markdown",
  "Fetch a page and return the article body as clean markdown (Readability + turndown). Best for articles, docs, blogs.",
  urlShape,
  async ({ url }) => {
    try { return await jsonResult(sb.markdown(url)); }
    catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_content",
  "Fetch a page and return {title, url, html} — the full rendered DOM after JS execution.",
  urlShape,
  async ({ url }) => {
    try { return await jsonResult(sb.content(url)); }
    catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_source",
  "Fetch a page and return {title, url, html} — the ORIGINAL response body, i.e. what 'view source' shows, before any JS runs. Use surf_content for the post-JS rendered DOM instead.",
  urlShape,
  async ({ url }) => {
    try { return await jsonResult(sb.source(url)); }
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
  async ({ url, ...opts }) => {
    try {
      const png = await sb.screenshot(url, opts);
      return { content: [{ type: "image", data: png.toString("base64"), mimeType: "image/png" }] };
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
  async ({ url, ...opts }) => {
    try {
      const pdf = await sb.pdf(url, opts);
      return {
        content: [{
          type: "resource",
          resource: { uri: `${url.replace(/\W+/g, "_").slice(0, 60)}.pdf`, mimeType: "application/pdf", blob: pdf.toString("base64") },
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
    try { return await jsonResult(Promise.resolve({ result: await sb.evaluate(url, script) })); }
    catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_batch",
  "Run one action over many urls in a single call — sequential server-side, failures don't abort the batch. Actions: markdown, content, source, evaluate. For RSS-digest / bulk-fetch workloads.",
  {
    action: z.enum(["markdown", "content", "source", "evaluate"]).describe("REST action to apply to each url"),
    urls: z.array(z.url()).min(1).max(20),
    script: z.string().optional().describe("required when action=evaluate"),
  },
  async ({ action, urls, script }) => {
    try {
      const results = await sb.batch(action, urls, { script, timeout: TIMEOUT * urls.length });
      return text(JSON.stringify(results.map(({ url, ok, status, data, error }) =>
        ({ url, ok, status, ...(ok ? { data } : { error }) })), null, 2));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  "surf_health",
  "Check whether the Surfbird engine is up.",
  {},
  async () => {
    try {
      const ok = await sb.health();
      return text(`surfbird ${ok ? "healthy" : "unhealthy"} @ ${BASE}`);
    } catch (e) { return fail(e); }
  },
);

await server.connect(new StdioServerTransport());
console.error(`[surfbird-mcp] ready → ${BASE}${TOKEN ? " (auth on)" : ""}`);
