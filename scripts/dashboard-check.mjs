/**
 * The per-pet health dashboard.
 *
 * The property that matters here is not that numbers appear — it is that they
 * only appear when they are real. This page reads several tables that may not
 * exist yet (the guided health check has not been migrated), so the interesting
 * cases are the absent ones:
 *
 *   - a brand-new pet must show NO numerals at all, and say why it is empty,
 *     rather than rendering zeroes that read as measurements
 *   - a metric with no data must be named as not-tracked, with a reason, and
 *     must not be a card with a dash in it
 *   - the body-part tiles must read "not checked" rather than green
 *
 *   node scripts/dashboard-check.mjs <base-url> [password]
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const GATE = process.argv[3] ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
const page = await ctx.newPage();
page.on("pageerror", (e) => bad("pageerror", e.message.slice(0, 130)));

const BROKEN = /went wrong on our side|application error|server-side exception/i;

try {
  const email = `dash-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "dash-password-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "Luna");
  await Promise.all([
    page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 40000 }),
    page.getByRole("button", { name: /save pet/i }).click(),
  ]);
  const petUrl = page.url();

  // The link must exist, or the page has no way in.
  (await page.getByRole("link", { name: /^dashboard$/i }).count()) > 0
    ? ok("pet page links to the dashboard")
    : bad("no Dashboard link on the pet page");

  await page.goto(`${petUrl.split("#")[0]}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const empty = await page.innerText("body");

  BROKEN.test(empty) ? bad("dashboard error boundary for a new pet") : ok("renders for a brand-new pet");

  const mainText = await page.locator("main").innerText().catch(() => empty);

  // Not "no digits on the page" — the copy legitimately cites "3 readings",
  // "two 30-day stretches" and "98 cats (Gruen 2017)". What must not exist is a
  // READING: a metric card carrying a number. So look for the shape of a
  // measurement rather than for digits.
  const fakeReading = /\b\d+(\.\d+)?\s?(kg|lb|bpm|°C|°F|km|mi|min|steps)\b/i.exec(mainText);
  !fakeReading
    ? ok("no measurement rendered for a pet with no data")
    : bad("empty dashboard shows a reading", fakeReading[0]);

  /0\s?(kg|steps|min|meals)/i.test(mainText)
    ? bad("renders a zero as if it were a measurement")
    : ok("no zero-as-measurement");

  /not tracked|isn't tracked|no data|nothing recorded|not checked/i.test(mainText)
    ? ok("names what is absent instead of showing zeroes")
    : bad("does not explain the emptiness");

  // Absent metrics must not render as a card with a dash.
  !/—\s*(kg|bpm|°|min)/i.test(mainText)
    ? ok("no dash-as-a-reading anywhere")
    : bad("renders an em-dash where a measurement would go");

  // Now give it real data and confirm the page uses it.
  // The weight form lives behind a tab, so the field does not exist until the
  // tab is opened — an earlier version of this test filled nothing and then
  // blamed the dashboard for showing nothing.
  const base = petUrl.split("#")[0];
  for (const [d, kg] of [["2026-08-10", "9.1"], ["2026-08-15", "9.4"], ["2026-08-20", "9.6"]]) {
    await page.goto(`${base}#records-weight`, { waitUntil: "networkidle" });
    await page.locator('[name="weight_kg"]').first().waitFor({ timeout: 20000 });
    await page.locator('[name="recorded_on"]').first().fill(d);
    await page.locator('[name="weight_kg"]').first().fill(kg);
    await page.getByRole("button", { name: /^log weight$/i }).first().click();
    await page.waitForTimeout(1500);
  }

  // Confirm the data really landed before judging the dashboard on it.
  await page.goto(`${base}#records-weight`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  (await page.innerText("body")).includes("9.6")
    ? ok("three weights logged")
    : bad("weights did not save — the rest of this run is meaningless");

  await page.goto(`${petUrl.split("#")[0]}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const withData = await page.locator("main").innerText().catch(() => "");
  /9\.6|9,6/.test(withData)
    ? ok("shows the latest weight once there is one")
    : bad("logged three weights, dashboard shows none", withData.replace(/\n+/g, " | ").slice(0, 200));

  // Every card must name where its number came from — the page's own rule.
  /your own|recorded|computed|the scale|you logged|from your/i.test(withData)
    ? ok("cards name their source")
    : bad("a number appears with no stated source");

  // A bad part slug must 404, not render an empty timeline.
  const res = await page.goto(`${petUrl.split("#")[0]}/dashboard/parts/not-a-real-part`, { waitUntil: "networkidle" });
  (res && res.status() === 404) || /not found/i.test(await page.innerText("body"))
    ? ok("unknown body part 404s")
    : bad("unknown body part renders anyway", String(res?.status()));

  // Mobile.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${petUrl.split("#")[0]}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  overflow <= 1 ? ok("no horizontal overflow at 390px") : bad(`overflows by ${overflow}px at 390px`);
} catch (e) {
  bad("run aborted", e.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\ndashboard: all checks passed");
process.exit(fails.length ? 1 : 0);
