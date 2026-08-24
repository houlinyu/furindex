/**
 * Drives the real landing-page widget against photos whose breed we know, and
 * prints what a visitor would actually be told.
 *
 * A measurement, not a pass/fail gate. An ImageNet classifier will be wrong
 * sometimes; the question worth answering before shipping is "how wrong, and
 * does it admit it?" — a confident wrong breed is a far worse failure than an
 * unconfident right one, so both columns are printed.
 *
 * Filenames carry the ground truth: dog_<breed>.jpg, and gt_<code>_<n>.jpg for
 * the Oxford-IIIT cat codes. The species half also drives the cat-or-dog tap,
 * which is what the widget asks before it will guess anything.
 *
 *   node scripts/breed-accuracy.mjs <base-url> <photo-dir>
 */
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const DIR = process.argv[3];
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

/** Oxford-IIIT cat codes → the breed the photo actually shows. */
const CAT_CODES = {
  abys: "Abyssinian", bene: "Bengal", birm: "Birman", bomb: "Bombay",
  bsho: "British Shorthair", emau: "Egyptian Mau", mcoo: "Maine Coon",
  pers: "Persian", ragd: "Ragdoll", rblu: "Russian Blue",
  siam: "Siamese", sphy: "Sphynx",
};

function truth(file) {
  if (file.startsWith("dog_")) {
    return {
      species: "dog",
      breed: file.replace(/^dog_/, "").replace(/\.\w+$/, "").replace(/-/g, " "),
    };
  }
  const m = /^gt_([a-z]+)_/.exec(file);
  return { species: "cat", breed: m ? CAT_CODES[m[1]] ?? m[1] : "unknown" };
}

const files = readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200));
});

const rows = [];
try {
  for (const f of files) {
    const t = truth(f);
    await page.goto(BASE, { waitUntil: "networkidle" });
    const started = Date.now();
    await page.setInputFiles('input[type="file"]', join(DIR, f));

    // The widget asks cat-or-dog before it will guess. Answer with the truth —
    // that is the question a real visitor can always answer correctly.
    const asking = page.locator("[data-testid=scan-asking]");
    await asking.waitFor({ timeout: 60000 }).catch(() => {});
    if (await asking.count()) {
      await page
        .getByRole("button", { name: t.species === "dog" ? /a dog/i : /a cat/i })
        .click();
    }

    await page
      .locator("[data-testid=scan-result], [data-testid=scan-fallback]")
      .first()
      .waitFor({ timeout: 180000 })
      .catch(() => {});
    await page.waitForTimeout(300);

    const fellBack = (await page.locator("[data-testid=scan-fallback]").count()) > 0;
    const card = page.locator("[data-testid=scan-result]");
    const text = fellBack ? "" : await card.innerText().catch(() => "");
    const said = fellBack
      ? "FELL BACK"
      : await card.locator("h3").first().innerText().catch(() => "(none)");
    const banner = /looks like|probably|best guess/i.exec(text)?.[0] ?? "-";

    // The whole point of this pass: when a breed is named, is the reader shown
    // that breed's own sourced fact, or the generic species fallback? The
    // fallback fact is the only place this exact phrase appears; its absence
    // (with a breed named) means a breed-specific note was served.
    const namedBreed = !fellBack && said !== "(none)" && !/^A mix|^A lovely mix/.test(said);
    const genericFallback = /far better than how they behave/.test(text);
    const specificFact = namedBreed && !genericFallback;
    const src = /Source:\s*([^.]+(?:\.[^.\n]+)?)/.exec(text)?.[1]?.trim().slice(0, 48) ?? "-";

    // Counted right if the true breed appears in what we told them at all: the
    // widget legitimately hedges to a pair, and a hedge containing the answer
    // is a different outcome from a confident miss.
    // Word-order insensitive: the filename says "collie border", the widget
    // says "Border Collie", and scoring that as a miss would understate the
    // model rather than measure it.
    const words = (x) => x.toLowerCase().match(/[a-z]+/g) ?? [];
    const saidWords = new Set(words(said));
    const hit = words(t.breed).every((w) => saidWords.has(w));
    const confidentMiss = !hit && /looks like/i.test(banner);

    rows.push({ f, species: t.species, truth: t.breed, said, banner, hit, confidentMiss, namedBreed, specificFact, src });
    console.log(
      `${f.padEnd(28)} ${banner.padEnd(11)} ` +
        `${hit ? "HIT " : confidentMiss ? "MISS!" : "miss "} ${specificFact ? "fact:OWN " : namedBreed ? "fact:GENERIC" : "fact:-      "} ` +
        `want=${t.breed.padEnd(18)} got=${said.padEnd(22)} src=${src}`
    );
  }
} finally {
  await browser.close();
}

for (const sp of ["dog", "cat"]) {
  const g = rows.filter((r) => r.species === sp);
  if (!g.length) continue;
  const hits = g.filter((r) => r.hit).length;
  const bad = g.filter((r) => r.confidentMiss).length;
  const named = g.filter((r) => r.namedBreed);
  const own = named.filter((r) => r.specificFact).length;
  console.log(
    `\n${sp}s: ${hits}/${g.length} contained the right breed · ${bad} confident misses` +
      ` · ${named.length} got a named breed, ${own} of them shown that breed's OWN sourced fact`
  );
}
if (errors.length) console.log("\npage errors:\n" + [...new Set(errors)].slice(0, 5).join("\n"));
