/**
 * Checks the forgot-password flow as far as it can be checked without an inbox.
 *
 * What is verifiable here: the entry point exists, the form is reachable and
 * submits, the confirmation never reveals whether the address has an account,
 * and the page the emailed link lands on renders the right thing. What is not:
 * the email itself, which needs a real mailbox — see the note at the end of the
 * run for the one manual step.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const requests = [];

async function fresh() {
  const p = await (await browser.newContext()).newPage();
  p.on("pageerror", (e) => bad("pageerror", e.message.slice(0, 130)));
  p.on("request", (r) => { if (/\/auth\/v1\/recover/.test(r.url())) requests.push(r.url()); });
  return p;
}

try {
  // --- entry point ---
  let page = await fresh();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  const forgot = page.getByRole("button", { name: /forgot your password/i });
  (await forgot.count()) === 1 ? ok("‘Forgot your password?’ on the sign-in view") : bad("no forgot link");

  await forgot.click();
  await page.waitForTimeout(400);
  const body = await page.innerText("body");
  /Reset your password/i.test(body) ? ok("reset view opens") : bad("reset view missing");
  // The tabs are for choosing how to sign in; resetting is neither. Assert on
  // the buttons, not the page text — the login page's own footer says "Email
  // links also work", which a substring match on the body reads as a tab.
  (await page.getByRole("button", { name: /^Email link$/ }).count()) === 0
    ? ok("sign-in tabs hidden while resetting")
    : bad("tabs still shown");
  /doesn’t\s+have one|doesn't\s+have one/i.test(body)
    ? ok("explains the never-had-a-password case")
    : bad("no link-account guidance");

  // --- an address that certainly has no account ---
  const ghost = `nobody-${Date.now()}@furindex-test.com`;
  await page.fill('input[name="email"]', ghost);
  await page.getByRole("button", { name: /email me a reset link/i }).click();
  // Longer than the client's own 12s bound, so "still Sending…" here means
  // genuinely stuck rather than merely slow.
  await page.waitForTimeout(15000);
  const sent = await page.innerText("body");
  requests.length > 0 ? ok("recovery request actually sent to Supabase") : bad("no /auth/v1/recover request");

  // Supabase's free mailer allows two of these an hour, so a run can legitimately
  // hit the cap. Both outcomes are correct behaviour; being stuck is not.
  const confirmed = /Check your inbox/i.test(sent);
  const capped = /Too many emails/i.test(sent);
  confirmed || capped
    ? ok(confirmed ? "confirmation shown for an unknown address" : "rate limit reported plainly (mailer capped)")
    : bad("neither confirmation nor rate-limit message", sent.replace(/\n+/g, " | ").slice(0, 220));
  !/Sending…/.test(sent) ? ok("button never stuck on ‘Sending…’") : bad("stuck on Sending…");
  if (confirmed) {
    /has an account/i.test(sent)
      ? ok("confirmation is non-committal — no account enumeration")
      : bad("confirmation reveals account existence", sent.slice(0, 200));
  }

  await page.getByRole("button", { name: /back to sign in/i }).click();
  await page.waitForTimeout(600);
  /Sign in/i.test(await page.innerText("body")) ? ok("‘Back to sign in’ returns") : bad("back button dead");

  // --- where the emailed link lands ---
  page = await fresh();
  await page.goto(`${BASE}/account?reset=1`, { waitUntil: "networkidle" });
  page.url().includes("/login")
    ? ok("reset landing page requires a session (signed out → /login)")
    : bad("account page reachable signed out");

  // signed in, with the reset marker
  const email = `reset-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "original-password-1");
  await Promise.all([page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click()]);

  await page.goto(`${BASE}/account?reset=1`, { waitUntil: "networkidle" });
  const landed = await page.innerText("body");
  /Choose a new password/i.test(landed) ? ok("reset landing says ‘Choose a new password’") : bad("generic account copy after reset");
  /signed you in as/i.test(landed) ? ok("names the account the link signed you into") : bad("does not name the account");

  // and it actually changes the password
  await page.fill('input[name="password"]', "brand-new-password-9");
  await page.fill('input[name="confirm"]', "brand-new-password-9");
  await page.getByRole("button", { name: /save password/i }).click();
  await page.waitForTimeout(4000);
  const saveBody = await page.innerText("body");
  /Password set/i.test(saveBody)
    ? ok("new password saved from the reset landing")
    : bad("save failed", saveBody.replace(/\n+/g, " | ").slice(0, 300));

  page = await fresh();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "brand-new-password-9");
  await page.getByRole("button", { name: /^sign in$/i }).first().click();
  await page.waitForTimeout(6000);
  page.url().includes("dashboard") ? ok("signs in with the reset password") : bad("reset password rejected", page.url());
} catch (e) { bad("run aborted", e.message.split("\n")[0]); }
finally { await browser.close(); }

console.log(
  fails.length
    ? `\nFAILED: ${fails.join(" | ")}`
    : "\nreset: all checks passed\nNOT covered here: delivery of the email itself, and that its link lands on /account?reset=1 — that needs a real mailbox, so click one through once by hand."
);
process.exit(fails.length ? 1 : 0);
