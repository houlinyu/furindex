/**
 * The one safety property that matters most: an OCR misreading must never be
 * able to enter a health record without a human actively saying yes.
 *
 * The unit tests show OCR getting digits wrong in ways that matter clinically —
 * 75mg read as 25mg, "BID x 7d" read as "BID x 2d", a rabies lot number off by
 * one. That is expected and unavoidable for OCR on a phone photo. What must NOT
 * be true is that any of it arrives pre-ticked, because then the default action
 * writes a wrong dose into a medical record.
 *
 * So this checks the defaults, not the accuracy:
 *   - a low-confidence (OCR) document pre-ticks NOTHING
 *   - the save button therefore offers to save zero records
 *   - the screen says, in words, that the numbers need checking
 *   - a high-confidence (text-layer PDF) document DOES pre-tick, because
 *     refusing to help when the data is exact would be its own failure
 *
 *   node scripts/ocr-safety-check.mjs <base-url> [password]
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const GATE = process.argv[3] ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

const fixture = (name) => {
  const u = new URL(`../fixtures/out/${name}`, import.meta.url);
  return existsSync(u) ? fileURLToPath(u) : null;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext();
if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
const page = await ctx.newPage();

/** Uploads a file and returns the state of the review screen. */
async function review(file) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', file);
  await page.waitForURL(/\/documents\/[0-9a-f-]{36}/, { timeout: 180000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  const boxes = page.locator('input[type="checkbox"]');
  const total = await boxes.count();
  let ticked = 0;
  for (let i = 0; i < total; i += 1) if (await boxes.nth(i).isChecked()) ticked += 1;
  const saveText = await page
    .getByRole("button", { name: /^Save \d+ records?$/ })
    .first()
    .innerText()
    .catch(() => "");
  return { total, ticked, saveText, body: await page.innerText("body") };
}

try {
  const email = `ocr-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "ocr-password-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "OcrSubject");
  await Promise.all([
    page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 40000 }),
    page.getByRole("button", { name: /save pet/i }).click(),
  ]);

  // ---- the dangerous case: a photograph, read by OCR ----
  const photo = fixture("f2-vaccination-card.png");
  if (!photo) {
    bad("fixture missing", "run `npm run fixtures` first");
  } else {
    const r = await review(photo);
    r.total > 0 ? ok(`OCR review offered ${r.total} records`) : bad("no records extracted from the photo");
    r.ticked === 0
      ? ok("OCR document pre-ticks NOTHING — a misread cannot be saved by default")
      : bad(`OCR document pre-ticked ${r.ticked} of ${r.total} records`, "a wrong dose is one click from the record");
    /Save 0 records/.test(r.saveText)
      ? ok(`save button offers zero by default ("${r.saveText}")`)
      : bad("save button offers to save something by default", r.saveText);
    /check anything numeric|misreads digits|check it against the original/i.test(r.body)
      ? ok("screen warns in words that the numbers need checking")
      : bad("no warning about OCR digit errors on the review screen");
  }

  // ---- the safe case: an exact text-layer PDF SHOULD help ----
  const pdf = fixture("f1-invoice-textlayer.pdf");
  if (pdf) {
    const r = await review(pdf);
    r.ticked > 0
      ? ok(`exact PDF pre-ticks ${r.ticked} of ${r.total} — refusing to help on exact data would be its own failure`)
      : bad("exact text-layer PDF pre-ticked nothing", "over-cautious to the point of useless");
    /no model, no upload/i.test(r.body)
      ? ok("says where the reading happened")
      : bad("does not say the document was read on-device");
  }
} catch (e) {
  bad("run aborted", e.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nocr safety: all checks passed");
process.exit(fails.length ? 1 : 0);
