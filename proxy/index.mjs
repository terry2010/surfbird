// Surfbird auth + REST proxy.
// Checks Bearer auth, proxies HTTP + WebSocket upgrade to the engine on
// loopback, and exposes a small REST layer over CDP.
//
// Env:
//   SURFBIRD_TOKEN        bearer token. REQUIRED in auth mode (empty → refuse start)
//   SURFBIRD_MODE         raw | auth (default raw)
//   SURFBIRD_PORT         listen port (default 8080)
//   ENGINE_HOST/PORT      engine loopback endpoint (default 127.0.0.1:8787)
//   TLS_CERT_PATH/TLS_KEY_PATH  enable HTTPS when both set
//   REST_TIMEOUT_MS       per-action timeout (default 120000)
//   MAX_CONCURRENT_ACTIONS  in-flight REST actions cap (default 2)
//   ENGINE_READY_TIMEOUT_MS  wait for engine before listening (default 120000)

import http from "node:http";
import https from "node:https";
import net from "node:net";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const MODE = process.env.SURFBIRD_MODE || "raw";
const TOKEN = process.env.SURFBIRD_TOKEN || "";
const PORT = Number(process.env.SURFBIRD_PORT || 8080);
const ENGINE = { host: process.env.ENGINE_HOST || "127.0.0.1", port: Number(process.env.ENGINE_PORT || 8787) };
const REST_TIMEOUT = Number(process.env.REST_TIMEOUT_MS || 120_000);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_ACTIONS || 2);
const READY_TIMEOUT = Number(process.env.ENGINE_READY_TIMEOUT_MS || 120_000);

// In auth mode an empty token would silently disable the gate — fail hard.
if (MODE === "auth" && !TOKEN) {
  console.error("[surfbird] SURFBIRD_MODE=auth requires SURFBIRD_TOKEN; refusing to start");
  process.exit(1);
}

// ---------- helpers ----------
const json = (res, status, obj) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};
const err = (res, status, code, message) => json(res, status, { error: { code, message } });

const authed = (req) => {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return false;
  const t = h.slice(7);
  return t.length === TOKEN.length &&
    crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
};

// engine liveness — used by /health and the startup readiness gate.
// upstream has no /health route; /json/version is the CDP discovery endpoint.
const engineOk = () =>
  new Promise((resolve) => {
    const r = http.request({ host: ENGINE.host, port: ENGINE.port, path: "/json/version", timeout: 3000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    r.on("error", () => resolve(false));
    r.on("timeout", () => { r.destroy(); resolve(false); });
    r.end();
  });

const waitEngine = async () => {
  const deadline = Date.now() + READY_TIMEOUT;
  while (Date.now() < deadline) {
    if (await engineOk()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

// ---------- concurrency gate ----------
let inFlight = 0;
const waiters = [];
async function acquire() {
  if (inFlight < MAX_CONCURRENT) return void inFlight++;
  await new Promise((r) => waiters.push(r));
  inFlight++;
}
function release() {
  inFlight--;
  waiters.shift()?.();
}

// ---------- REST actions over CDP ----------
const require_ = createRequire(import.meta.url);
const libCache = {};
function pageLib(name) {
  if (!libCache[name]) {
    const file = name === "readability"
      ? require_.resolve("@mozilla/readability/Readability.js")
      : require_.resolve("turndown/dist/turndown.js");
    libCache[name] = fs.readFileSync(file, "utf8");
  }
  return libCache[name];
}

async function restAction(action, body) {
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.connect({
    browserWSEndpoint: `ws://${ENGINE.host}:${ENGINE.port}/devtools/browser`,
  });
  try {
    const page = await browser.newPage();
    await page.goto(body.url, { timeout: REST_TIMEOUT, waitUntil: body.waitUntil || "load" });

    if (action === "screenshot") {
      await page.setViewport({ width: body.width || 1280, height: body.height || 720 });
      const png = await page.screenshot({ fullPage: !!body.fullPage, type: "png" });
      return { status: 200, type: "image/png", body: png };
    }
    if (action === "pdf") {
      const pdf = await page.pdf({ landscape: !!body.landscape, format: body.format || "A4" });
      return { status: 200, type: "application/pdf", body: pdf };
    }
    if (action === "content") {
      const data = await page.evaluate(() => ({
        title: document.title, url: location.href,
        html: document.documentElement.outerHTML,
      }));
      return { status: 200, type: "application/json", body: JSON.stringify(data) };
    }
    if (action === "markdown") {
      // Readability extracts the article, turndown converts to real markdown.
      await page.addScriptTag({ content: pageLib("readability") });
      await page.addScriptTag({ content: pageLib("turndown") });
      const out = await page.evaluate(() => {
        const article = new Readability(document.cloneNode(true)).parse();
        if (!article) return null;
        const md = new TurndownService({ headingStyle: "atx" }).turndown(article.content);
        return { title: article.title, byline: article.byline, excerpt: article.excerpt, url: location.href, markdown: md };
      });
      if (!out) return { status: 422, type: "application/json", body: JSON.stringify({ error: { code: "no_article", message: "Readability could not extract an article" } }) };
      return { status: 200, type: "application/json", body: JSON.stringify(out) };
    }
    if (action === "evaluate") {
      const result = await page.evaluate(body.script);
      return { status: 200, type: "application/json", body: JSON.stringify({ result }) };
    }
    return { status: 404, type: "application/json", body: JSON.stringify({ error: { code: "unknown_action", message: action } }) };
  } finally {
    await browser.disconnect().catch(() => {});
  }
}

const ACTIONS = new Set(["screenshot", "pdf", "content", "markdown", "evaluate"]);

// ---------- HTTP server ----------
const handler = async (req, res) => {
  const url = new URL(req.url, "http://x");

  // unauthenticated liveness: ok only when the engine is actually up
  if (req.method === "GET" && url.pathname === "/health") {
    const ok = await engineOk();
    res.writeHead(ok ? 200 : 503, { "content-type": "text/plain" });
    return res.end(ok ? "ok" : "engine not ready");
  }

  if (MODE === "auth" && !authed(req)) return err(res, 401, "unauthorized", "missing or bad token");

  const action = url.pathname.replaceAll("/", "");
  if (req.method === "POST" && ACTIONS.has(action)) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch {}
    if (!body.url || typeof body.url !== "string") {
      return err(res, 400, "bad_request", "url required");
    }
    await acquire();
    try {
      const out = await restAction(action, body);
      res.writeHead(out.status, { "content-type": out.type });
      return res.end(out.body);
    } catch (e) {
      return err(res, 502, "engine_error", String(e?.message || e));
    } finally {
      release();
    }
  }

  // everything else → transparent proxy to engine
  const p = http.request({
    host: ENGINE.host, port: ENGINE.port,
    method: req.method, path: req.url, headers: req.headers,
  }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
  req.pipe(p);
  p.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("engine unreachable"); });
};

// ---------- WebSocket upgrade (CDP) ----------
const onUpgrade = (req, sock, head) => {
  if (MODE === "auth" && !authed(req)) {
    sock.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    sock.destroy();
    return;
  }
  const upstream = net.connect(ENGINE.port, ENGINE.host, () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`);
    for (const [k, v] of Object.entries(req.headers)) upstream.write(`${k}: ${v}\r\n`);
    upstream.write("\r\n");
    if (head?.length) upstream.write(head);
    upstream.pipe(sock);
    sock.pipe(upstream);
  });
  upstream.on("error", () => sock.destroy());
  sock.on("error", () => upstream.destroy());
};

const useTLS = process.env.TLS_CERT_PATH && process.env.TLS_KEY_PATH;
const server = useTLS
  ? https.createServer({ cert: fs.readFileSync(process.env.TLS_CERT_PATH), key: fs.readFileSync(process.env.TLS_KEY_PATH) }, handler)
  : http.createServer(handler);
server.on("upgrade", onUpgrade);

// don't accept traffic until the engine is actually answering
const ready = await waitEngine();
if (!ready) {
  console.error(`[surfbird] engine not ready within ${READY_TIMEOUT}ms`);
  process.exit(1);
}
server.listen(PORT, () =>
  console.log(`[surfbird] ${useTLS ? "https" : "http"}://0.0.0.0:${PORT} → engine ${ENGINE.host}:${ENGINE.port} (mode ${MODE}, auth ${TOKEN ? "on" : "OFF"})`));
