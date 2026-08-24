/**
 * Measures what a page actually costs a visitor, so optimisation targets come
 * from evidence rather than from the build output's biggest number.
 *
 * Reports, per page: bytes actually transferred, request count, and the paint
 * timing the browser itself recorded.
 *
 * Two things learned the hard way and encoded here:
 *
 * 1. Bytes come from the page's own resource timing, not from content-length
 *    response headers. Those headers are absent on every compressed or chunked
 *    response, which made an earlier version of this script report a confident
 *    "1k" for every page on the site.
 *
 * 2. Each page is sampled several times and the BEST paint is reported. A
 *    serverless cold start put one reading at 2320ms against a true 368ms, and
 *    a single sample would have sent someone optimising a page that is fine.
 *    The spread is printed too, because a cold start is a real thing a visitor
 *    can hit — it is just not the page's weight.
 *
 *   node scripts/perf-check.mjs <base-url> [password]
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const GATE = process.argv[3] ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function context() {
  const ctx = await browser.newContext();
  if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
  return ctx;
}

/** Signs up once so the authenticated pages can be measured too. */
async function authed() {
  const ctx = await context();
  const page = await ctx.newPage();
  const email = `perf-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "perf-password-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "Perf");
  await Promise.all([
    page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 40000 }),
    page.getByRole("button", { name: /save pet/i }).click(),
  ]);
  return { ctx, page, petUrl: page.url() };
}

const SAMPLES = 3;

async function once(ctx, url) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  const out = await page.evaluate(() => {
    const res = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByName("first-contentful-paint")[0];
    const size = (r) => r.encodedBodySize || r.transferSize || 0;
    return {
      bytes: res.reduce((s, r) => s + size(r), 0) + (nav?.encodedBodySize ?? 0),
      jsBytes: res
        .filter((r) => r.name.endsWith(".js") || r.initiatorType === "script")
        .reduce((s, r) => s + size(r), 0),
      requests: res.length + 1,
      ttfb: nav ? Math.round(nav.responseStart) : null,
      fcp: paint ? Math.round(paint.startTime) : null,
      nodes: document.querySelectorAll("*").length,
    };
  });
  await page.close();
  return out;
}

async function measure(ctx, url, label) {
  const runs = [];
  for (let i = 0; i < SAMPLES; i += 1) runs.push(await once(ctx, url));
  const best = (k) => Math.min(...runs.map((r) => r[k] ?? Infinity));
  const worst = (k) => Math.max(...runs.map((r) => r[k] ?? 0));
  const last = runs[runs.length - 1];
  return {
    label,
    bytes: last.bytes,
    jsBytes: last.jsBytes,
    requests: last.requests,
    nodes: last.nodes,
    ttfb: best("ttfb"),
    fcp: best("fcp"),
    fcpWorst: worst("fcp"),
  };
}

const rows = [];
try {
  // Public pages, cold cache each time.
  for (const [label, path] of [
    ["landing", "/"],
    ["writing index", "/writing"],
    ["a blog post", "/writing/breed-tells-you-how-a-dog-looks"],
    ["compare", "/compare"],
    ["login", "/login"],
  ]) {
    const ctx = await context();
    rows.push(await measure(ctx, `${BASE}${path}`, label));
    await ctx.close();
  }

  // Authenticated pages, sharing one session (a real user's cache is warm here).
  const { ctx, petUrl } = await authed();
  rows.push(await measure(ctx, `${BASE}/dashboard`, "dashboard"));
  rows.push(await measure(ctx, petUrl, "pet page (empty)"));
  rows.push(await measure(ctx, `${BASE}/community`, "community"));
  rows.push(await measure(ctx, `${petUrl}/summary`, "vet summary"));
  await ctx.close();
} finally {
  await browser.close();
}

const kb = (n) => (n / 1024).toFixed(0).padStart(5) + "k";
const ms = (n) => (!n || n === Infinity ? "    -" : String(n).padStart(5));
console.log(`best of ${SAMPLES} samples per page\n`);
console.log("page".padEnd(20) + "  bytes    js  reqs   ttfb    fcp  worst  nodes");
for (const r of rows) {
  console.log(
    r.label.padEnd(20) +
      `${kb(r.bytes)} ${kb(r.jsBytes)} ${String(r.requests).padStart(5)} ` +
      `${ms(r.ttfb)} ${ms(r.fcp)} ${ms(r.fcpWorst)} ${String(r.nodes).padStart(6)}`
  );
}

// Flag what a visitor would notice, not what is merely large.
console.log("");
let flagged = 0;
for (const r of rows) {
  if (r.fcp > 1800) { console.log(`SLOW  ${r.label}: best FCP ${r.fcp}ms`); flagged += 1; }
  if (r.bytes > 900 * 1024) { console.log(`HEAVY ${r.label}: ${kb(r.bytes).trim()}B transferred`); flagged += 1; }
  if (r.nodes > 3000) { console.log(`DOM   ${r.label}: ${r.nodes} nodes`); flagged += 1; }
  // A large gap between best and worst is a cold start, not page weight.
  if (r.fcpWorst > r.fcp * 4 && r.fcpWorst > 1500) {
    console.log(`COLD  ${r.label}: ${r.fcp}ms best vs ${r.fcpWorst}ms worst — cold start, not weight`);
  }
}
if (!flagged) console.log("nothing over threshold");
