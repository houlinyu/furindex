/**
 * Full upload -> extract -> SAVE -> verify-on-pet round trip, for both a PDF
 * (text layer) and a PHOTO (browser OCR).
 *
 * The real-world benchmark only checks the review screen. This goes further: it
 * ticks and saves, then reads the pet's own page back to confirm the records
 * actually persisted — a vaccination with the right due date, a medication, a
 * weight, a visit. And it re-asserts the safety contract at the point it matters
 * most: an OCR photo pre-ticks nothing, so a misread cannot be saved without a
 * human tick.
 *
 *   node scripts/upload-roundtrip.mjs <base-url> [password]
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const GATE = process.argv[3] ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const OUT = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "fixtures", "out");

const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext();
if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
const page = await ctx.newPage();
page.on("pageerror", (e) => bad("pageerror", e.message.slice(0, 120)));

/** Reads the four record-tab counts off a pet page. */
async function counts(petUrl) {
  await page.goto(`${petUrl}#records`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const body = await page.innerText("body");
  const n = (label) => {
    const m = new RegExp(`${label}\\s*\\n?\\s*(\\d+)`).exec(body);
    return m ? Number(m[1]) : 0;
  };
  return {
    vaccinations: n("Vaccinations"),
    medications: n("Medications"),
    weight: n("Weight"),
    visits: n("Vet visits"),
    body,
  };
}

async function uploadAndReview(petUrl, file) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', file);
  const reached = await page
    .waitForURL(/\/documents\/[0-9a-f-]{36}/, { timeout: 180000 })
    .then(() => true)
    .catch(() => false);
  if (!reached) return null;
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  return page.innerText("body");
}

try {
  const email = `roundtrip-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "roundtrip-pw-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "RoundTrip");
  await Promise.all([
    page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 40000 }),
    page.getByRole("button", { name: /save pet/i }).click(),
  ]);
  const petUrl = page.url().split("#")[0];

  const before = await counts(petUrl);

  // ---------- PDF (text layer): the F1 invoice, save, verify it persisted ----
  const f1 = join(OUT, "f1-invoice-textlayer.pdf");
  if (!existsSync(f1)) bad("f1 fixture missing — run npm run fixtures");
  else {
    const review = await uploadAndReview(petUrl, f1);
    review ? ok("PDF reached the review screen") : bad("PDF never reached review");
    if (review) {
      const save = page.getByRole("button", { name: /^Save \d+ records?$/ });
      (await save.isEnabled().catch(() => false))
        ? ok("PDF review pre-ticked records and the Save button is ready")
        : bad("PDF Save button not ready (nothing pre-ticked?)");
      await Promise.all([
        page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 60000 }),
        save.click(),
      ]);
      const after = await counts(petUrl);
      after.vaccinations >= before.vaccinations + 3
        ? ok(`PDF: vaccinations persisted (${before.vaccinations} -> ${after.vaccinations})`)
        : bad("PDF: vaccinations did not persist", `${before.vaccinations} -> ${after.vaccinations}`);
      after.medications >= before.medications + 1
        ? ok(`PDF: medications persisted (${after.medications})`)
        : bad("PDF: medications did not persist");
      after.weight > before.weight
        ? ok("PDF: weight persisted")
        : bad("PDF: weight did not persist");
      after.visits > before.visits
        ? ok("PDF: vet visit persisted")
        : bad("PDF: vet visit did not persist");
      after.body.includes("Rabies") ? ok("PDF: Rabies is on the pet's record") : bad("PDF: Rabies missing from record");
    }
  }

  // ---------- certificate PDF: due date must survive to the record ----------
  const cert = join(OUT, "rw1-rabies-cert.pdf");
  if (existsSync(cert)) {
    const before2 = await counts(petUrl);
    const review = await uploadAndReview(petUrl, cert);
    if (review) {
      const save = page.getByRole("button", { name: /^Save \d+ records?$/ });
      if (await save.isEnabled().catch(() => false)) {
        await Promise.all([
          page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 60000 }),
          save.click(),
        ]);
      }
      const after2 = await counts(petUrl);
      after2.vaccinations > before2.vaccinations
        ? ok("certificate: the rabies vaccination persisted")
        : bad("certificate: nothing persisted");
      // The 2029 due date should be visible on the record now.
      await page.goto(`${petUrl}#records-vaccinations`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      (await page.innerText("body")).includes("2029")
        ? ok("certificate: the 2029 next-due date reached the record")
        : bad("certificate: next-due date lost between review and record");
    }
  }

  // ---------- PHOTO (browser OCR): must pre-tick NOTHING, then save on tick --
  const photo = join(OUT, "f2-vaccination-card.png");
  if (!existsSync(photo)) bad("f2 photo fixture missing");
  else {
    const review = await uploadAndReview(petUrl, photo);
    review ? ok("PHOTO reached the review screen (browser OCR)") : bad("PHOTO never reached review");
    if (review) {
      const boxes = page.locator('input[type="checkbox"]');
      const total = await boxes.count();
      let ticked = 0;
      for (let i = 0; i < total; i += 1) if (await boxes.nth(i).isChecked()) ticked += 1;
      ticked === 0
        ? ok("PHOTO: OCR pre-ticks NOTHING — a misread can't be saved by default")
        : bad(`PHOTO: OCR pre-ticked ${ticked}/${total} (safety breach)`);
      /^Save 0 records?$/.test(
        (await page.getByRole("button", { name: /^Save \d+ records?$/ }).innerText().catch(() => ""))
      )
        ? ok('PHOTO: the button offers "Save 0 records" until a human ticks')
        : bad("PHOTO: button offered to save something by default");

      // A human ticks one box, then saving works.
      if (total > 0) {
        const beforeP = await counts(petUrl);
        const review2 = await uploadAndReview(petUrl, photo);
        if (review2) {
          const b2 = page.locator('input[type="checkbox"]');
          if ((await b2.count()) > 0) {
            await b2.first().check();
            const save = page.getByRole("button", { name: /^Save \d+ records?$/ });
            if (await save.isEnabled().catch(() => false)) {
              await Promise.all([
                page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 60000 }),
                save.click(),
              ]);
              const afterP = await counts(petUrl);
              const grew =
                afterP.vaccinations + afterP.medications + afterP.weight + afterP.visits >
                beforeP.vaccinations + beforeP.medications + beforeP.weight + beforeP.visits;
              grew
                ? ok("PHOTO: a ticked OCR record saves to the pet")
                : bad("PHOTO: ticking + saving did not persist a record");
            }
          }
        }
      }
    }
  }
} catch (e) {
  bad("run aborted", e.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nupload round trip: photo and PDF both become saved records");
process.exit(fails.length ? 1 : 0);
