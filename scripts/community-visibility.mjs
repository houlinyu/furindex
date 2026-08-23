import { chromium } from "playwright-core";
const BASE = process.argv[2], GATE = process.argv[3];
const CHROME = "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function session(tag) {
  const ctx = await browser.newContext();
  if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [${tag} pageerror]`, e.message));
  const email = `comm-${tag}-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "comm-password-123");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click()]);
  return { page, email };
}

const MARK = `beacon-${Date.now()}`;
try {
  const a = await session("a");
  await a.page.goto(`${BASE}/community`, { waitUntil: "networkidle" });
  let body = await a.page.innerText("body");
  console.log("A landed on:", /Posting as/i.test(body) ? "FEED" : "JOIN SCREEN");
  if (!/Posting as/i.test(body)) {
    await a.page.fill('input[name="display_name"]', "Author A");
    await a.page.getByRole("button", { name: /join|save|create/i }).first().click();
    await a.page.waitForLoadState("networkidle");
    await a.page.waitForTimeout(1500);
    await a.page.reload({ waitUntil: "networkidle" });
  }
  body = await a.page.innerText("body");
  console.log("A after join:", /Posting as/i.test(body) ? "IN FEED" : "STILL GATED");

  await a.page.locator("textarea").first().fill(`Hello from A ${MARK}`);
  await a.page.getByRole("button", { name: /post|share/i }).first().click();
  await a.page.waitForLoadState("networkidle");
  await a.page.waitForTimeout(2000);
  await a.page.reload({ waitUntil: "networkidle" });
  console.log("A sees own post:", (await a.page.innerText("body")).includes(MARK) ? "yes" : "NO");

  const b = await session("b");
  await b.page.goto(`${BASE}/community`, { waitUntil: "networkidle" });
  let bBody = await b.page.innerText("body");
  if (!/Posting as/i.test(bBody)) {
    await b.page.fill('input[name="display_name"]', "Reader B");
    await b.page.getByRole("button", { name: /join|save|create/i }).first().click();
    await b.page.waitForLoadState("networkidle");
    await b.page.waitForTimeout(1500);
  }
  await b.page.reload({ waitUntil: "networkidle" });
  bBody = await b.page.innerText("body");
  console.log("B in feed:", /Posting as/i.test(bBody) ? "yes" : "NO");
  console.log("B sees A's post:", bBody.includes(MARK) ? "VISIBLE" : "INVISIBLE");
  if (!bBody.includes(MARK)) console.log("\n--- what B sees ---\n" + bBody.slice(0, 1500));
} catch (e) { console.log("FAILED:", e.message); }
finally { await browser.close(); }
