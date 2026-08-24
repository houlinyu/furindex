/**
 * Feeds every record form values a real person could plausibly type by mistake,
 * and checks the app says something a human can act on.
 *
 * Three failure modes this is looking for, in order of severity:
 *   1. a 500 or a rendered error boundary — the page breaks
 *   2. a raw technical string reaching the user ("numeric field overflow",
 *      "violates check constraint", "invalid input syntax for type date")
 *   3. silent acceptance of nonsense — a weight of -5 kg stored without comment,
 *      which is worse than a rejection because the record now lies
 *
 * Silent acceptance is judged, not guessed: after each submit the page is read
 * back to see whether the value actually landed.
 *
 * TWO THINGS AN EARLIER VERSION OF THIS FILE GOT WRONG, both of which made it
 * report success it had not earned:
 *
 *   - The record forms live behind tabs driven by the URL hash, not by clicking
 *     a button whose accessible name is "Weight". The old version clicked
 *     nothing, filled nothing, submitted nothing, and then read the page back,
 *     found no bad value in it, and called that a rejection. Every tabbed case
 *     was a false pass. Navigate to #records-<tab>.
 *   - Several fields carry HTML constraints (weight is min="0.01"), so the
 *     browser blocks submission itself and shows a native bubble that is not in
 *     the DOM. That IS a valid rejection, but it is invisible to innerText — so
 *     validity is asked of the field directly before deciding what happened.
 *
 *   node scripts/validation-check.mjs <base-url> [password]
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const GATE = process.argv[3] ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const RAW_ERROR =
  /numeric field overflow|violates (check|not-null|foreign key) constraint|invalid input syntax|duplicate key value|PGRST\d+|column .* does not exist|Unexpected token|\bZodError\b/i;
const BROKEN = /went wrong on our side|application error|server-side exception|Unhandled Runtime/i;

const rows = [];
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

const ctx = await browser.newContext();
if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));

/** Fills only the fields a form actually has, so one table drives every tab. */
let PET_URL = "";

async function submit({ tab, fields, button }) {
  // Hash-driven, and the form does not exist in the DOM until the tab opens.
  await page.goto(`${PET_URL}#records-${tab}`, { waitUntil: "networkidle" });
  const firstField = Object.keys(fields)[0];
  await page
    .locator(`[name="${firstField}"]`)
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {});
  if ((await page.locator(`[name="${firstField}"]`).count()) === 0) {
    return { body: "", newErrors: 0, unreachable: true };
  }

  for (const [name, value] of Object.entries(fields)) {
    const el = page.locator(`[name="${name}"]`).first();
    if ((await el.count()) === 0) continue;
    await el.fill(String(value)).catch(() => {});
  }

  // Ask the browser whether it will even allow this, before clicking.
  let blockedNatively = false;
  let nativeMessage = "";
  for (const name of Object.keys(fields)) {
    const el = page.locator(`[name="${name}"]`).first();
    if ((await el.count()) === 0) continue;
    const valid = await el.evaluate((e) => e.checkValidity()).catch(() => true);
    if (!valid) {
      blockedNatively = true;
      nativeMessage = await el.evaluate((e) => e.validationMessage).catch(() => "");
      break;
    }
  }

  const before = pageErrors.length;
  await page.getByRole("button", { name: button }).first().click().catch(() => {});
  await page.waitForTimeout(1800);
  const body = await page.innerText("body").catch(() => "");
  return { body, newErrors: pageErrors.length - before, blockedNatively, nativeMessage };
}

function judge(label, result, expectation) {
  const { body, newErrors, blockedNatively, nativeMessage, unreachable } = result;
  if (unreachable) {
    rows.push({ label, unreachable: true });
    console.log(`  ${label.padEnd(46)} FORM UNREACHABLE — nothing was tested`);
    return;
  }
  const broken = BROKEN.test(body);
  const raw = RAW_ERROR.exec(body)?.[0] ?? null;
  const accepted = expectation.landed ? expectation.landed(body) : null;
  rows.push({ label, broken, raw, accepted, newErrors, blockedNatively });
  const verdict = broken
    ? "BREAKS PAGE"
    : raw
      ? `RAW ERROR: ${raw}`
      : blockedNatively
        ? `blocked by the browser ("${nativeMessage.slice(0, 40)}")`
        : accepted === true
          ? "ACCEPTED"
          : accepted === false
            ? "rejected by the server"
            : "no crash";
  console.log(`  ${label.padEnd(46)} ${verdict}${newErrors ? `  (+${newErrors} page errors)` : ""}`);
}

try {
  const email = `valid-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "valid-password-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "Validator");
  await Promise.all([
    page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 40000 }),
    page.getByRole("button", { name: /save pet/i }).click(),
  ]);
  const petUrl = page.url().split("#")[0];
  PET_URL = petUrl;

  console.log("\n--- WEIGHT ---");
  for (const [label, w] of [
    ["negative weight (-5)", "-5"],
    ["zero weight", "0"],
    ["absurd weight (99999)", "99999"],
    ["non-numeric weight (abc)", "abc"],
  ]) {
    judge(
      label,
      await submit({
        tab: "weight",
        fields: { weight_kg: w, recorded_on: "2026-08-20" },
        button: /^log weight$/i,
      }),
      { landed: (b) => b.includes(`${w} kg`) }
    );
  }

  console.log("\n--- DATES ---");
  await page.goto(`${petUrl}#records`, { waitUntil: "networkidle" });
  judge(
    "vaccination given in the future (2030)",
    await submit({
      tab: "vaccinations",
      fields: { name: "FutureVax", administered_on: "2030-01-01", due_on: "2031-01-01" },
      button: /^add vaccination$/i,
    }),
    { landed: (b) => b.includes("FutureVax") }
  );

  await page.goto(`${petUrl}#records`, { waitUntil: "networkidle" });
  judge(
    "vaccination due BEFORE it was given",
    await submit({
      tab: "vaccinations",
      fields: { name: "BackwardsVax", administered_on: "2026-08-01", due_on: "2025-01-01" },
      button: /^add vaccination$/i,
    }),
    { landed: (b) => b.includes("BackwardsVax") }
  );

  await page.goto(`${petUrl}#records`, { waitUntil: "networkidle" });
  judge(
    "vet visit dated year 3000",
    await submit({
      tab: "visits",
      fields: { visited_on: "3000-01-01", clinic: "YearThreeThousand", reason: "checkup" },
      button: /^add visit$/i,
    }),
    { landed: (b) => b.includes("YearThreeThousand") }
  );

  await page.goto(`${petUrl}#records`, { waitUntil: "networkidle" });
  judge(
    "medication ending before it starts",
    await submit({
      tab: "medications",
      fields: {
        name: "BackwardsMed",
        dosage: "1 tablet",
        frequency: "daily",
        start_date: "2026-08-20",
        end_date: "2026-01-01",
      },
      button: /^add medication$/i,
    }),
    { landed: (b) => b.includes("BackwardsMed") }
  );

  console.log("\n--- MONEY ---");
  await page.goto(`${petUrl}#records`, { waitUntil: "networkidle" });
  judge(
    "negative visit cost (-500)",
    await submit({
      tab: "visits",
      fields: { visited_on: "2026-08-20", clinic: "NegativeCost", cost: "-500" },
      button: /^add visit$/i,
    }),
    { landed: (b) => b.includes("NegativeCost") }
  );

  console.log("\n--- TEXT ---");
  await page.goto(`${petUrl}#records`, { waitUntil: "networkidle" });
  judge(
    "5000-character vaccination name",
    await submit({
      tab: "vaccinations",
      fields: { name: "V".repeat(5000), administered_on: "2026-08-20" },
      button: /^add vaccination$/i,
    }),
    {}
  );

  await page.goto(`${petUrl}#records`, { waitUntil: "networkidle" });
  judge(
    "script tag as a clinic name",
    await submit({
      tab: "visits",
      fields: { visited_on: "2026-08-20", clinic: "<script>window.__xss=1</script>" },
      button: /^add visit$/i,
    }),
    {}
  );
  const executed = await page.evaluate(() => "__xss" in window);
  console.log(`  ${"script tag executed?".padEnd(46)} ${executed ? "YES — XSS" : "no, escaped"}`);
  if (executed) rows.push({ label: "XSS", broken: true, raw: null });

  console.log("\n--- PET NAME ---");
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', " ".repeat(200));
  await page.getByRole("button", { name: /save pet/i }).click();
  await page.waitForTimeout(1800);
  {
    const body = await page.innerText("body");
    judge("pet name of 200 spaces", { body, newErrors: 0 }, {});
  }
} catch (e) {
  console.log("\nRUN ABORTED:", e.message.split("\n")[0]);
} finally {
  await browser.close();
}

const bad = rows.filter((r) => r.broken || r.raw);
const accepted = rows.filter((r) => r.accepted === true);
const untested = rows.filter((r) => r.unreachable);
console.log(
  `\n${rows.length} cases · ${bad.length} broken-or-raw · ${accepted.length} accepted nonsense` +
    ` · ${untested.length} NOT ACTUALLY TESTED`
);
for (const r of untested) console.log(`  UNTESTED  ${r.label} — the form never opened; this is not a pass`);
for (const r of bad) console.log(`  SEVERE  ${r.label}: ${r.broken ? "page broke" : r.raw}`);
for (const r of accepted) console.log(`  STORED  ${r.label} — value was saved as given`);
if (pageErrors.length) console.log(`\ndistinct page errors:\n  ${[...new Set(pageErrors)].join("\n  ")}`);
process.exit(bad.length || untested.length ? 1 : 0);
