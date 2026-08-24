/**
 * Follows a REAL password-reset link, end to end.
 *
 * The earlier reset check navigated straight to /account?reset=1 with a session
 * it already had, and so proved only that the landing page renders. It could
 * not tell whether the emailed link actually delivers someone there — and it
 * didn't: the user reported clicking the email and landing signed in on the
 * dashboard with no password form in sight.
 *
 * This mints the identical link Supabase puts in the email (admin generateLink,
 * type "recovery") and clicks it in a fresh browser. Everything after the click
 * is exactly what a person sees.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in the environment. It is never written to a
 * file — pass it on the command line for this one run.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/reset-link-check.mjs <base-url>
 */
import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of readFileSync(join(repo, ".env.local"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required (pass it inline, do not store it)");
  process.exit(2);
}

const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = `resetlink-${Date.now()}@furindex-test.com`;
const oldPassword = "old-password-111";
const newPassword = "new-password-222";

// A real account with a real password, so "did the old one stop working" is testable.
{
  const { error } = await admin.auth.admin.createUser({
    email, password: oldPassword, email_confirm: true,
  });
  if (error) { console.error("createUser:", error.message); process.exit(1); }
}

// The exact link the recovery email carries, built the same way the app asks
// for it (redirectTo → /auth/callback?next=/account?reset=1).
const redirectTo = `${BASE}/auth/callback?next=${encodeURIComponent("/account?reset=1")}`;
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "recovery", email, options: { redirectTo },
});
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(1); }
const link = linkData.properties.action_link;
console.log("recovery link minted →", link.replace(/token=[^&]+/, "token=…"));

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const page = await (await browser.newContext()).newPage();
const hops = [];
page.on("response", (r) => {
  if ([301, 302, 303, 307, 308].includes(r.status())) hops.push(`${r.status()} ${r.url()} → ${r.headers().location}`);
});

try {
  await page.goto(link, { waitUntil: "networkidle", timeout: 60000 });
  // The callback establishes the session then client-navigates; wait for it to
  // leave /auth/callback rather than reading mid-flight.
  await page.waitForURL((u) => !u.pathname.includes("/auth/callback"), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  const landed = page.url();
  const text = await page.innerText("body");
  console.log("\nredirect chain:");
  for (const h of hops) console.log("   ", h.replace(/token=[^&]+/, "token=…").slice(0, 160));
  console.log("landed on:", landed, "\n");

  /\/account/.test(landed)
    ? ok("lands on /account")
    : bad("did NOT land on /account", landed);
  /reset=1/.test(landed)
    ? ok("reset marker survived the round trip")
    : bad("reset=1 was dropped", landed);
  /Choose a new password/i.test(text)
    ? ok("page says 'Choose a new password'")
    : bad("no password form visible — this is the bug the user hit", text.replace(/\n+/g, " | ").slice(0, 200));

  // Set the new password through the real form.
  const pw = page.locator('input[name="password"]').first();
  if ((await pw.count()) === 0) {
    bad("no password field on the landing page");
  } else {
    await pw.fill(newPassword);
    await page.locator('input[name="confirm"]').first().fill(newPassword);
    await page.getByRole("button", { name: /save password/i }).click();
    await page.waitForTimeout(3500);
    /Password set/i.test(await page.innerText("body"))
      ? ok("new password saved from the emailed link")
      : bad("save did not confirm");
  }

  // Fresh browser: new works, old does not.
  const p2 = await (await browser.newContext()).newPage();
  await p2.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p2.fill('input[name="email"]', email);
  await p2.fill('input[name="password"]', newPassword);
  await p2.getByRole("button", { name: /^sign in$/i }).first().click();
  await p2.waitForTimeout(6000);
  p2.url().includes("dashboard") ? ok("signs in with the NEW password") : bad("new password rejected", p2.url());

  const p3 = await (await browser.newContext()).newPage();
  await p3.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await p3.fill('input[name="email"]', email);
  await p3.fill('input[name="password"]', oldPassword);
  await p3.getByRole("button", { name: /^sign in$/i }).first().click();
  await p3.waitForTimeout(5000);
  !p3.url().includes("dashboard") ? ok("OLD password no longer works") : bad("old password still signs in");
} catch (e) {
  bad("run aborted", e.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\nreset link: the emailed link works end to end");
process.exit(fails.length ? 1 : 0);
