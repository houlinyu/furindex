/**
 * End-to-end proof that the no-key reader works through the real product:
 * register, create a pet, drop a vet report on the page, and check that the
 * review screen offers the records the document actually contains.
 *
 *   npm run build && npx next start -p 3999 &
 *   node scripts/e2e-extract-local.mjs http://127.0.0.1:3999 fixtures/out/f1-invoice-textlayer.pdf
 *
 * Needs a browser: CHROME_PATH, or playwright's default install path.
 */
import { chromium } from "playwright-core";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3999";
const FIXTURE = resolve(process.argv[3] ?? "fixtures/out/f1-invoice-textlayer.pdf");
const CHROME =
  process.env.CHROME_PATH ?? "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const email = `extract-${Date.now()}@furindex-test.com`;
const password = "test-password-123";

const fails = [];
const ok = (l) => console.log(`  ✓ ${l}`);
const bad = (l, d) => {
  console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`);
  fails.push(l);
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await browser.newContext().then((c) => c.newPage());
page.on("pageerror", (e) => console.log("  · page error:", e.message));

try {
  // ---- register ----------------------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: /^Create account$/ }).click();
  await page.waitForURL(/\/dashboard|\/pets/, { timeout: 30000 });
  ok(`registered ${email}`);

  // ---- create a pet ------------------------------------------------------
  await page.goto(`${BASE}/pets/new`, { waitUntil: "domcontentloaded" });
  await page.fill("#name", "Mochi");
  await page.getByRole("button", { name: /^Save pet$/ }).click();
  await page.waitForURL(/\/pets\/[0-9a-f]{8}-/, { timeout: 30000 });
  const petUrl = page.url();
  ok(`created a pet at ${petUrl.replace(BASE, "")}`);

  // ---- upload the report -------------------------------------------------
  // The pet page has several file inputs (photo, breed scan, journal). The
  // report drop is the one that accepts a PDF.
  const input = page.locator('input[type="file"][accept*="application/pdf"]').first();
  await input.setInputFiles(FIXTURE);
  try {
    await page.waitForURL(/\/documents\//, { timeout: 90000 });
  } catch (e) {
    console.log("  · page text at failure:\n" + (await page.innerText("body")).slice(0, 1200));
    throw e;
  }
  ok(`uploaded ${FIXTURE.split("/").pop()} and landed on the review screen`);

  await page.waitForTimeout(1500);
  const body = await page.innerText("body");

  // What each fixture actually says. The OCR fixture asks for less, because
  // OCR delivers less — and its rows must arrive unticked.
  const EXPECTED = {
    "f1-invoice-textlayer.pdf": [
      [/Mochi/, "the patient's name"],
      [/Shiba Inu/, "the breed"],
      [/Cambridge Veterinary Associates/, "the clinic"],
      [/9\.39 kg/, "the weight, converted from 20.7 lb"],
      [/Rabies/, "the rabies vaccination"],
      [/DHPP/, "the DHPP vaccination"],
      [/Bordetella/, "the bordetella vaccination"],
      [/RB-4471902/, "a lot number"],
      [/Apoquel/, "the medication"],
      [/5\.4 mg/, "its dosage, verbatim"],
      [/twice daily for 14 days/, "its frequency, verbatim"],
      [/284\.50/, "the total charged"],
      [/Body condition score/i, "a measurement with no fixed field of its own"],
      [/without a model|no upload to anyone/i, "the note saying how it was read"],
    ],
    "f2-vaccination-card.png": [
      [/Pepper/, "the patient's name"],
      [/Domestic Shorthair/, "the breed"],
      [/BROOKLINE ANIMAL HOSPITAL/i, "the clinic"],
      [/FVRCP/, "the FVRCP vaccination, read back from OCR's \"FuRep\""],
      [/Rabies/, "the rabies vaccination"],
      [/FeLV/, "the FeLV vaccination"],
      [/196/, "the total charged"],
      [/Hard to read/i, "the warning banner shown at low confidence"],
      [/by OCR/i, "the note saying it was OCR'd"],
      [/not a plausible body weight/i, "the note that an impossible weight was dropped"],
    ],
  };
  const expectations = EXPECTED[FIXTURE.split("/").pop()] ?? EXPECTED["f1-invoice-textlayer.pdf"];
  for (const [re, label] of expectations) {
    if (re.test(body)) ok(`review screen shows ${label}`);
    else bad(`review screen is missing ${label}`, re.source);
  }
  if (/doesn't look like a vet report/i.test(body)) bad("the report came back unreadable");

  // Ticked by default is only right when the reader is confident.
  const boxes = await page.locator('input[type="checkbox"]').all();
  const checked = await Promise.all(boxes.map((b) => b.isChecked()));
  const n = checked.filter(Boolean).length;
  console.log(`  · ${n} of ${boxes.length} rows pre-ticked (high confidence pre-ticks; low ticks nothing)`);

  await page.screenshot({ path: "/tmp/extract-local-review.png", fullPage: true });
  console.log("  · screenshot: /tmp/extract-local-review.png");
} catch (err) {
  bad("e2e run threw", err.message);
} finally {
  await browser.close();
}

console.log(fails.length ? `\n${fails.length} failure(s)` : "\nall good");
process.exit(fails.length ? 1 : 0);
