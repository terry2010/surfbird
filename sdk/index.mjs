// surfbird — JS/TS client for the Surfbird REST API. Zero dependencies.
//
//   import { Surfbird } from "surfbird";
//   const sb = new Surfbird("http://vps:8080", { token: "..." });
//   const { markdown } = await sb.markdown("https://example.com/post");

export class SurfbirdError extends Error {
  constructor(status, code, message) {
    super(`HTTP ${status} ${code}: ${message}`);
    this.status = status;
    this.code = code;
  }
}

export class Surfbird {
  /**
   * @param {string} base  e.g. "http://127.0.0.1:8080" — the auth image's proxy.
   *   The raw image has no REST layer (engine-only: CDP + /json/* + /rbi/*).
   * @param {object} [opts]
   * @param {string} [opts.token]   Bearer token (required on auth images)
   * @param {number} [opts.timeout] per-request ms, default 120000
   */
  constructor(base = "http://127.0.0.1:8080", { token = "", timeout = 120_000 } = {}) {
    this.base = base.replace(/\/+$/, "");
    this.token = token;
    this.timeout = timeout;
  }

  async #post(action, body, timeout = this.timeout) {
    const res = await fetch(`${this.base}/${action}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      let code = "http_error", message = res.statusText;
      try {
        const e = JSON.parse(buf.toString()).error || {};
        if (e.code) code = e.code;
        if (e.message) message = e.message;
      } catch { /* non-JSON error body */ }
      throw new SurfbirdError(res.status, code, message);
    }
    return buf;
  }

  /** Engine liveness (unauthenticated). */
  async health() {
    try {
      const r = await fetch(`${this.base}/health`, { signal: AbortSignal.timeout(10_000) });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** OpenAPI description of the server's REST surface (unauthenticated). */
  async openapi() {
    const r = await fetch(`${this.base}/openapi.json`, { signal: AbortSignal.timeout(10_000) });
    return r.json();
  }

  /** Article extraction → {title, byline, excerpt, url, markdown}. Throws 422 SurfbirdError when no article. */
  async markdown(url, opts = {}) {
    return JSON.parse((await this.#post("markdown", { url, ...opts })).toString());
  }

  /** Rendered DOM → {title, url, html}. */
  async content(url, opts = {}) {
    return JSON.parse((await this.#post("content", { url, ...opts })).toString());
  }

  /** PNG screenshot → Buffer. opts: {width, height, fullPage} */
  async screenshot(url, opts = {}) {
    return this.#post("screenshot", { url, ...opts });
  }

  /** PDF → Buffer. opts: {landscape, format} */
  async pdf(url, opts = {}) {
    return this.#post("pdf", { url, ...opts });
  }

  /** Evaluate JS in page context → result (JSON-serializable). */
  async evaluate(url, script, opts = {}) {
    return (JSON.parse((await this.#post("evaluate", { url, script, ...opts })).toString())).result;
  }

  /**
   * Run one action over many urls, sequentially (respects the server
   * concurrency gate). Returns [{url, ok, status, data|error}] in input order.
   * opts: {script, timeout} — script required for action="evaluate";
   * timeout defaults to per-request timeout × urls (matches server worst case).
   */
  async batch(action, urls, opts = {}) {
    const { timeout, ...rest } = opts;
    const res = await this.#post("batch", { action, urls, ...rest },
      timeout ?? this.timeout * urls.length);
    return JSON.parse(res.toString());
  }
}

export default Surfbird;
