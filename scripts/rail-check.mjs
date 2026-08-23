import { chromium } from "playwright-core";
const BASE = process.argv[2], GATE = process.argv[3];
const CHROME = "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

async function signedIn(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => bad("pageerror", e.message.slice(0, 120)));
  const email = `rail-${width}-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "rail-password-123");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click()]);
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "Rail");
  await Promise.all([page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 40000 }),
    page.getByRole("button", { name: /save pet/i }).click()]);
  await page.waitForLoadState("networkidle");
  // The rail filters itself on mount; wait for hydration to settle so the test
  // measures the finished state rather than the server-rendered one.
  await page.locator("[data-testid=pet-rail-chips] a").first().waitFor({ state: "attached", timeout: 15000 });
  await page.waitForTimeout(500);
  return page;
}

try {
  // ---------- wide: fixed rail ----------
  let page = await signedIn(1280, 800);
  // Both renderings are always in the DOM; the breakpoint display:none's one of
  // them, which also removes it from the accessibility tree — so a role query
  // finds exactly one, and testids are how the test names the other.
  (await page.locator("[data-testid=pet-rail], [data-testid=pet-rail-chips]").count()) === 2
    ? ok("both rail renderings in DOM")
    : bad("rail count", String(await page.locator("[data-testid=pet-rail], [data-testid=pet-rail-chips]").count()));

  const rail = page.locator("[data-testid=pet-rail]");
  await rail.isVisible() ? ok("wide: rail visible") : bad("wide: rail hidden at 1280px");
  const links = rail.locator("a");
  const n = await links.count();
  n >= 6 ? ok(`wide: ${n} section links`) : bad("too few links", String(n));

  // every link must point at an element that exists
  const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  const missing = await page.evaluate((hs) => hs.filter((h) => !document.querySelector(h)), hrefs);
  missing.length === 0 ? ok("wide: every link resolves") : bad("dangling anchors", missing.join(","));

  // rail must not sit on top of the content column
  // The rail is a grid column now, so "clears the content" means it sits left
  // of the first section rather than left of the whole shell.
  const railBox = await rail.boundingBox();
  const contentBox = await page.locator("#vaccines").boundingBox();
  railBox && contentBox && railBox.x + railBox.width <= contentBox.x + 2
    ? ok("wide: rail clears the content column")
    : bad("rail overlaps content", JSON.stringify({ railBox, contentBox }));

  const wideDoc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  wideDoc.sw <= wideDoc.cw + 1 ? ok("wide: no horizontal overflow") : bad("wide horizontal overflow", JSON.stringify(wideDoc));

  // Sticky, not fixed: it must still be on screen after scrolling down.
  await page.evaluate(() => window.scrollTo(0, 2500));
  await page.waitForTimeout(400);
  const stuckRail = await rail.boundingBox();
  stuckRail && stuckRail.y >= 0 && stuckRail.y < 200
    ? ok("wide: rail stays on screen while scrolling")
    : bad("rail scrolled away", JSON.stringify(stuckRail));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // clicking actually moves the page
  const before = await page.evaluate(() => window.scrollY);
  await links.nth(n - 1).click();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.scrollY);
  after > before + 300 ? ok(`wide: click scrolled ${Math.round(after - before)}px`) : bad("click did not scroll", `${before}->${after}`);

  // scrollspy marks something current
  await page.waitForTimeout(600);
  (await rail.locator('a[aria-current="true"]').count()) === 1
    ? ok("wide: scrollspy marks one link current")
    : bad("scrollspy", String(await rail.locator('a[aria-current="true"]').count()));

  // ---------- narrow: sticky chips ----------
  page = await signedIn(390, 780);
  const chips = page.locator("[data-testid=pet-rail-chips]");
  await chips.isVisible() ? ok("narrow: chip strip visible") : bad("narrow: chips hidden");
  (await page.locator("[data-testid=pet-rail]").isVisible())
    ? bad("narrow: wide rail should be hidden") : ok("narrow: wide rail hidden");
  (await chips.locator("a").count()) >= 6
    ? ok(`narrow: ${await chips.locator("a").count()} chips`)
    : bad("too few chips");

  const doc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  doc.sw <= doc.cw + 1 ? ok("narrow: no horizontal overflow") : bad("horizontal overflow", JSON.stringify(doc));

  await page.evaluate(() => window.scrollTo(0, 1200));
  await page.waitForTimeout(500);
  const stuck = await chips.boundingBox();
  stuck && stuck.y <= 2 ? ok("narrow: chips stay stuck to the top") : bad("chips scrolled away", JSON.stringify(stuck));
} catch (e) { bad("run aborted", e.message.split("\n")[0]); }
finally { await browser.close(); }
console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nrail: all checks passed");
process.exit(fails.length ? 1 : 0);
