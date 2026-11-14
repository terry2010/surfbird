#!/usr/bin/env node
// Collect daily npm download + Docker Hub pull metrics →
// append metrics/data.jsonl → regenerate dashboard.md. No dependencies.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const NPM_PKGS = ["surfbird", "surfbird-mcp"];
const DOCKER_REPO = "terry2010/surfbird";
const DATA_FILE = "metrics/data.jsonl";
const DASHBOARD = "dashboard.md";
const FETCH_TIMEOUT = 15_000;
const HISTORY_ROWS = 30;

// fetch() first; curl as last resort — it honors HTTP(S)_PROXY on dev
// machines where undici ignores proxy env vars (Node <24).
const get = async (url, attempt = 0) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: { "user-agent": "surfbird-metrics/1.0" },
    });
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 30_000));
      return get(url, 1);
    }
    return JSON.parse(
      execFileSync("curl", ["-sf", "--max-time", "30", url], {
        encoding: "utf8",
      }),
    );
  } finally {
    clearTimeout(t);
  }
};

const dl = (period, pkg) =>
  get(`https://api.npmjs.org/downloads/point/${period}/${pkg}`);

const npm = {};
for (const pkg of NPM_PKGS) {
  const [day, week, month, total] = await Promise.all([
    dl("last-day", pkg),
    dl("last-week", pkg),
    dl("last-month", pkg),
    dl("2020-01-01:2100-01-01", pkg),
  ]);
  npm[pkg] = {
    daily: day.downloads,
    weekly: week.downloads,
    monthly: month.downloads,
    total: total.downloads,
  };
}

const hub = await get(`https://hub.docker.com/v2/repositories/${DOCKER_REPO}/`);
const docker = { pulls: hub.pull_count, stars: hub.star_count };

const date = new Date().toISOString().slice(0, 10);
const record = { date, npm, docker };

mkdirSync("metrics", { recursive: true });
const prev = existsSync(DATA_FILE)
  ? readFileSync(DATA_FILE, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((r) => r.date !== date)
  : [];
prev.push(record);
writeFileSync(DATA_FILE, prev.map((r) => JSON.stringify(r)).join("\n") + "\n");

const baseline = prev.at(-2);
const fmt = (n) => n.toLocaleString("en-US");
const delta = (n) =>
  baseline ? `+${fmt(n)}`.replace("+-", "−") : "—";
const dPulls = baseline ? docker.pulls - baseline.docker.pulls : null;
const dStars = baseline ? docker.stars - baseline.docker.stars : null;

const history = prev.slice(-HISTORY_ROWS).reverse();
const histRows = history
  .map((r, i) => {
    const older = history[i + 1];
    const dp = older ? r.docker.pulls - older.docker.pulls : null;
    return `| ${r.date} | ${fmt(r.npm.surfbird.daily)} | ${fmt(r.npm["surfbird-mcp"].daily)} | ${fmt(r.docker.pulls)} | ${dp === null ? "—" : "+" + fmt(dp)} | ${r.docker.stars} |`;
  })
  .join("\n");

writeFileSync(
  DASHBOARD,
  `# Surfbird Metrics Dashboard

_Last updated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC ·
regenerated daily by [\`metrics.yml\`](.github/workflows/metrics.yml)_

## npm downloads

| package | last 24h | last 7d | last 30d | total |
|---|---:|---:|---:|---:|
${NPM_PKGS.map((p) => `| [${p}](https://www.npmjs.com/package/${p}) | ${fmt(npm[p].daily)} | ${fmt(npm[p].weekly)} | ${fmt(npm[p].monthly)} | ${fmt(npm[p].total)} |`).join("\n")}

## Docker Hub — [${DOCKER_REPO}](https://hub.docker.com/r/${DOCKER_REPO})

| metric | value | Δ since ${baseline?.date ?? "—"} |
|---|---:|---:|
| pulls | ${fmt(docker.pulls)} | ${dPulls === null ? "—" : delta(dPulls)} |
| stars | ${fmt(docker.stars)} | ${dStars === null ? "—" : delta(dStars)} |

## Daily history (last ${HISTORY_ROWS} entries)

| date | surfbird dl | surfbird-mcp dl | docker pulls | Δ pulls | docker stars |
|---|---:|---:|---:|---:|---:|
${histRows}

> npm numbers are rolling windows reported by the npm downloads API
> (last-24h/last-7d/last-30d), not calendar days. Docker Hub exposes only
> cumulative repo pull counts — per-tag pulls are not public. Data source
> snapshots live in [\`metrics/data.jsonl\`](metrics/data.jsonl).
`,
);

console.log(`metrics: npm ${JSON.stringify(npm)} docker ${JSON.stringify(docker)}`);
console.log(`wrote ${DATA_FILE} (${prev.length} entries) + ${DASHBOARD}`);
