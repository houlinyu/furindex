/**
 * Measures the on-device dog classifier's accuracy at scale, from the RAW model
 * output — so it scores the model, not the widget's copy.
 *
 * Reads /identify?scandebug=1, which logs the raw top-8 predictions to the
 * console, uploads each labelled photo, and compares:
 *   - top-1 dog breed (the single best in-species class)
 *   - top-3 (correct breed anywhere in the top three dog classes)
 *
 * The manifest is "<path>\t<expected tidied ImageNet name>" per line.
 *
 *   node scripts/breed-bench.mjs <base-url> <manifest.tsv>
 */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const MANIFEST = process.argv[3];
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const DOG = [151, 268];
const tidy = (label) =>
  label
    .split(",")[0]
    .trim()
    .split(" ")
    .map((w) => (w.length > 2 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

const rows = readFileSync(MANIFEST, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => l.split("\t"));

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await (await browser.newContext()).newPage();

let raw = null;
page.on("console", (m) => {
  const t = m.text();
  const mm = /\[scandebug\] raw: (\[.*?\]) mapped: (\[.*\])/.exec(t);
  if (mm) raw = JSON.parse(mm[2]);
});

let top1 = 0, top3 = 0, done = 0;
const perBreed = {};
try {
  for (const [file, expected] of rows) {
    raw = null;
    await page.goto(`${BASE}/identify?scandebug=1`, { waitUntil: "networkidle" });
    await page.setInputFiles('input[type="file"]', file);
    await page.locator("[data-testid=scan-asking]").waitFor({ timeout: 90000 }).catch(() => {});
    if (await page.locator("[data-testid=scan-asking]").count())
      await page.getByRole("button", { name: /a dog/i }).click();
    await page.locator("[data-testid=scan-result]").waitFor({ timeout: 120000 }).catch(() => {});
    for (let i = 0; i < 30 && !raw; i += 1) await page.waitForTimeout(200);
    if (!raw) { console.log(`  (no output) ${file}`); continue; }

    const dogs = raw.filter((p) => p.index >= DOG[0] && p.index <= DOG[1]).map((p) => tidy(p.label));
    const t1 = dogs[0] === expected;
    const t3 = dogs.slice(0, 3).includes(expected);
    top1 += t1; top3 += t3; done += 1;
    perBreed[expected] ??= { n: 0, t1: 0 };
    perBreed[expected].n += 1; perBreed[expected].t1 += t1;
  }
} finally {
  await browser.close();
}

console.log(`\nn=${done}  top1=${top1} (${((top1 / done) * 100).toFixed(1)}%)  top3=${top3} (${((top3 / done) * 100).toFixed(1)}%)`);
console.log("\nper breed (top-1):");
for (const [b, s] of Object.entries(perBreed).sort())
  console.log(`  ${b.padEnd(18)} ${s.t1}/${s.n}`);
