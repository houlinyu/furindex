/**
 * Post-deploy smoke test. Run against production after EVERY deploy.
 *
 * This exists because a "use client" export imported into a server component
 * type-checks, builds clean, and then throws only at request time — so every
 * pet page 500'd in production behind a green build. Checking the pages I had
 * just edited was not enough; the failure was one import away from them.
 *
 *   node scripts/smoke.mjs https://furindex.vercel.app <site-password>
 *
 * Exits non-zero on any failure so it can gate a deploy.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const GATE = process.argv[3] ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const fails = [];
const ok = (label) => console.log(`  ✓ ${label}`);
const bad = (label, detail) => {
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
  fails.push(label);
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext();
if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
const page = await ctx.newPage();

// A rendered error boundary is a 200, so status codes alone would pass here.
const errored = async () => {
  const t = (await page.innerText("body").catch(() => "")).toLowerCase();
  return /went wrong on our side|application error|server-side exception/.test(t);
};

try {
  for (const path of ["/", "/compare", "/science", "/partners", "/login"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    (await errored()) ? bad(`public ${path}`) : ok(`public ${path}`);
  }

  const email = `smoke-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "smoke-password-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 30000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  (await errored()) ? bad("dashboard") : ok("dashboard");

  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "SmokePet");
  await Promise.all([
    page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 30000 }),
    page.getByRole("button", { name: /save pet/i }).click(),
  ]);
  const petUrl = page.url();

  // The one that mattered: a fully-populated authenticated page.
  await page.waitForTimeout(1500);
  (await errored()) ? bad("PET DETAIL PAGE") : ok("pet detail page");

  // ...and that its sections actually rendered, not just that it didn't throw.
  const body = (await page.innerText("body")).toLowerCase();
  for (const s of ["reminders", "activity", "journal", "insurance", "nutrition", "add a document"]) {
    body.includes(s) ? ok(`section: ${s}`) : bad(`section missing: ${s}`);
  }

  for (const [label, url] of [
    ["pet list", `${BASE}/pets`],
    ["community", `${BASE}/community`],
    ["edit pet", `${petUrl}/edit`],
    ["summary", `${petUrl}/summary`],
  ]) {
    await page.goto(url, { waitUntil: "networkidle" });
    (await errored()) ? bad(label) : ok(label);
  }
} catch (err) {
  bad("run aborted", String(err.message).split("\n")[0].slice(0, 160));
} finally {
  await browser.close();
}

console.log(fails.length ? `\nFAILED (${fails.length}): ${fails.join(", ")}` : "\nAll smoke checks passed");
process.exit(fails.length ? 1 : 0);
