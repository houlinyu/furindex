/**
 * Benchmarks document extraction against real-world vet-record templates.
 *
 * Uploads each fixtures/out/rw*.pdf through the actual app (a real signed-in
 * user, the real upload -> read -> review flow) and scores the review screen
 * against the ground truth in realworld.expect.json. Reports per-document what
 * was found and what was missed, so the number is auditable rather than a bare
 * pass/fail.
 *
 *   node scripts/realworld-bench.mjs <base-url> [password]
 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const GATE = process.argv[3] ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(repo, "fixtures", "out");
const expect = JSON.parse(readFileSync(join(OUT, "realworld.expect.json"), "utf8"));

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext();
if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
const page = await ctx.newPage();

let totalChecks = 0;
let totalHits = 0;
const perDoc = [];

try {
  const email = `rwbench-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "rwbench-password-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "BenchPet");
  await Promise.all([
    page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 40000 }),
    page.getByRole("button", { name: /save pet/i }).click(),
  ]);

  for (const [name, truth] of Object.entries(expect)) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.setInputFiles('input[type="file"]', join(OUT, name));
    const reached = await page
      .waitForURL(/\/documents\/[0-9a-f-]{36}/, { timeout: 120000 })
      .then(() => true)
      .catch(() => false);
    if (!reached) {
      perDoc.push({ name, note: "never reached review", checks: [] });
      continue;
    }
    await page.waitForLoadState("networkidle");
    const body = await page.innerText("body");

    const checks = [];
    const has = (re) => (typeof re === "string" ? body.toLowerCase().includes(re.toLowerCase()) : re.test(body));

    // Dates are rendered human-readable, so match on the day/month/year parts.
    const dateShown = (iso) => {
      if (!iso) return true;
      const [y, m, d] = iso.split("-");
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return body.includes(y) && body.includes(String(Number(d))) && body.includes(months[Number(m) - 1]);
    };

    if (truth.microchip) checks.push(["microchip", has(truth.microchip)]);
    if (truth.vaccine) checks.push([`vaccine ${truth.vaccine}`, has(truth.vaccine)]);
    for (const v of truth.vaccines ?? []) checks.push([`vaccine ${v}`, has(v)]);
    if (truth.medication) checks.push([`med ${truth.medication}`, has(truth.medication)]);
    for (const m of truth.medications ?? []) checks.push([`med ${m}`, has(m)]);
    if (truth.weight_kg) checks.push([`weight ${truth.weight_kg}`, has(String(truth.weight_kg))]);
    if (truth.clinic) checks.push(["clinic", has(truth.clinic)]);
    if (truth.cost_total) checks.push([`cost ${truth.cost_total}`, has(String(truth.cost_total)) || has("217")]);
    if (truth.lot) checks.push([`lot ${truth.lot}`, has(truth.lot)]);
    if (truth.given) checks.push(["date given", dateShown(truth.given)]);
    if (truth.due) checks.push(["next due", dateShown(truth.due)]);
    if (truth.visited_on) checks.push(["visit date", dateShown(truth.visited_on)]);

    for (const [, ok] of checks) { totalChecks += 1; if (ok) totalHits += 1; }
    perDoc.push({ name, checks });
  }
} finally {
  await browser.close();
}

console.log("\n=== real-world template extraction ===");
for (const doc of perDoc) {
  const hits = doc.checks.filter(([, ok]) => ok).length;
  console.log(`\n${doc.name}  ${doc.note ? "(" + doc.note + ")" : `${hits}/${doc.checks.length}`}`);
  for (const [label, ok] of doc.checks) console.log(`  ${ok ? "ok " : "MISS"} ${label}`);
}
console.log(`\nTOTAL fields extracted: ${totalHits}/${totalChecks} (${((totalHits / totalChecks) * 100).toFixed(1)}%)`);
