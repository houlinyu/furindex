/**
 * Does a new post appear without the poster having to reload?
 *
 * This exists because a real user reported "someone posted and I couldn't see
 * it", and the database turned out to hold no such post at all — so the failure
 * was on the way in, not on the way out. The most likely version of that: you
 * post, nothing visibly changes, you assume it didn't work.
 *
 * Deliberately never reloads before asserting. An earlier check reloaded first
 * and so would have passed even if the feed never updated on its own.
 *
 *   node scripts/community-post-check.mjs <base-url> [password]
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

async function joined(tag) {
  const ctx = await browser.newContext();
  if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => bad(`${tag} pageerror`, e.message.slice(0, 120)));
  const email = `post-${tag}-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "post-password-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.goto(`${BASE}/community`, { waitUntil: "networkidle" });
  if (!/Posting as/i.test(await page.innerText("body"))) {
    await page.fill('input[name="display_name"]', `Poster ${tag}`);
    await page.getByRole("button", { name: /join|save|create/i }).first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
  }
  return { ctx, page };
}

try {
  const mark = `beacon-${Date.now()}`;
  const { ctx, page } = await joined("a");

  await page.locator("textarea").first().fill(`Testing the feed ${mark}`);
  await page.getByRole("button", { name: /^post$/i }).first().click();

  // No reload. This is the whole point of the check.
  let appeared = false;
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(500);
    if ((await page.innerText("body")).includes(mark)) { appeared = true; break; }
  }
  appeared
    ? ok("new post appears in the feed without a reload")
    : bad("post did not appear without a reload — a poster would think it failed");

  // The composer must clear, or the next post is a duplicate of this one.
  const left = await page.locator("textarea").first().inputValue();
  left.trim() === ""
    ? ok("composer cleared after posting")
    : bad("composer still holds the posted text", left.slice(0, 60));

  // And it must survive a reload, i.e. it really was written.
  await page.reload({ waitUntil: "networkidle" });
  (await page.innerText("body")).includes(mark)
    ? ok("post persisted")
    : bad("post vanished after reload — it was never written");

  // A second reader must see it too.
  const b = await joined("b");
  const seen = (await b.page.innerText("body")).includes(mark);
  seen ? ok("a second account sees it") : bad("invisible to another account");
  await b.ctx.close();
  await ctx.close();
} catch (e) {
  bad("run aborted", e.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\ncommunity post: all checks passed");
process.exit(fails.length ? 1 : 0);
