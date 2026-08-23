import { chromium } from "playwright-core";
const BASE = process.argv[2];
const CHROME = "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const email = `setpw-${Date.now()}@furindex-test.com`;
const first = "first-password-1";
const second = "second-password-2";
const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

async function fresh() {
  const p = await (await browser.newContext()).newPage();
  p.on("pageerror", (e) => bad("pageerror", e.message.slice(0, 120)));
  return p;
}

try {
  let page = await fresh();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', first);
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click()]);
  ok("account created");

  // the header email should now be a link to /account
  await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
  (await page.innerText("body")).includes("Set a password") ? ok("/account renders") : bad("/account missing form");

  await page.fill('input[name="password"]', second);
  await page.fill('input[name="confirm"]', "does-not-match");
  await page.getByRole("button", { name: /save password/i }).click();
  await page.waitForTimeout(2500);
  /don't match/i.test(await page.innerText("body")) ? ok("mismatch rejected") : bad("mismatch not caught");

  await page.fill('input[name="password"]', "short");
  await page.fill('input[name="confirm"]', "short");
  await page.getByRole("button", { name: /save password/i }).click();
  await page.waitForTimeout(2000);
  /8 characters/i.test(await page.innerText("body")) ? ok("short password rejected") : bad("short password accepted");

  await page.fill('input[name="password"]', second);
  await page.fill('input[name="confirm"]', second);
  await page.getByRole("button", { name: /save password/i }).click();
  await page.waitForTimeout(3500);
  /Password set/i.test(await page.innerText("body")) ? ok("password saved") : bad("no success message", (await page.innerText("body")).slice(0, 200));

  // brand-new browser: the NEW password must work
  page = await fresh();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', second);
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.waitForTimeout(6000);
  page.url().includes("dashboard") ? ok("signed in with the new password") : bad("new password rejected", page.url());

  // and the OLD one must not
  page = await fresh();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', first);
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.waitForTimeout(5000);
  const t = await page.innerText("body");
  !page.url().includes("dashboard") && /don't match an account/.test(t)
    ? ok("old password rejected, with the link hint")
    : bad("old password still works", page.url());
} catch (e) { bad("run aborted", e.message.split("\n")[0]); }
finally { await browser.close(); }
console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nset-password: all checks passed");
process.exit(fails.length ? 1 : 0);
