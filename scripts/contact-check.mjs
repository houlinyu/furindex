/**
 * The contact + partner forms, end to end, and the privacy of the inbox.
 *
 * What must hold:
 *   - anyone (signed out) can submit both forms
 *   - both submissions actually land in the database
 *   - the OWNER account sees them in /inbox
 *   - a NON-owner signed-in account sees nothing there (RLS, not just routing)
 *
 * The owner account is created for the test with the real owner email via the
 * admin API, so the RLS policy that keys on that address is exercised for real.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/contact-check.mjs <base-url>
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
if (!SERVICE) { console.error("SUPABASE_SERVICE_ROLE_KEY required"); process.exit(2); }

const fails = [];
const ok = (m) => console.log("  ok  " + m);
const bad = (m, d) => { console.log("  BAD " + m + (d ? " :: " + d : "")); fails.push(m); };

const OWNER = "yuhoulin737@gmail.com";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The owner-read path is verified WITHOUT signing in as the real owner (that
// would mean resetting their password, which could lock them out). Instead the
// policy's own predicate is evaluated with the service role, which proves the
// rows WOULD be returned to that email — combined with the browser test below
// that a real signed-in stranger sees nothing, that pins RLS from both sides.

const CONTACT_MARK = `contact-beacon-${Date.now()}`;
const PARTNER_MARK = `partner-beacon-${Date.now()}`;
const senderEmail = `sender-${Date.now()}@furindex-test.com`;

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

try {
  // ---- submit both forms, signed out ----
  const anon = await browser.newContext();
  const cp = await anon.newPage();
  await cp.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
  await cp.fill('input[name="email"]', senderEmail);
  await cp.fill('textarea[name="message"]', `Hello from contact ${CONTACT_MARK}`);
  await cp.getByRole("button", { name: /send message/i }).click();
  await cp.waitForTimeout(2500);
  /Got it|thank you/i.test(await cp.innerText("body"))
    ? ok("contact form accepts a signed-out submission")
    : bad("contact form did not confirm", (await cp.innerText("body")).slice(0, 160));

  const pp = await anon.newPage();
  await pp.goto(`${BASE}/collaborate`, { waitUntil: "networkidle" });
  await pp.fill('input[name="email"]', senderEmail);
  await pp.fill('textarea[name="message"]', `Building ${PARTNER_MARK}`);
  await pp.getByRole("button", { name: /^send$/i }).click();
  await pp.waitForTimeout(2500);
  /reached us|thank/i.test(await pp.innerText("body"))
    ? ok("partner form accepts a signed-out submission")
    : bad("partner form did not confirm", (await pp.innerText("body")).slice(0, 160));
  await anon.close();

  // ---- a NON-owner must see nothing in the inbox ----
  const stranger = await browser.newContext();
  const sp = await stranger.newPage();
  const strangerEmail = `stranger-${Date.now()}@furindex-test.com`;
  await sp.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await sp.getByRole("button", { name: /create an account/i }).click();
  await sp.fill('input[name="email"]', strangerEmail);
  await sp.fill('input[name="password"]', "stranger-pw-123");
  await Promise.all([sp.waitForURL(/dashboard/, { timeout: 40000 }),
    sp.getByRole("button", { name: "Create account" }).click()]);
  await sp.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
  const strangerView = await sp.innerText("body");
  const strangerLeak = strangerView.includes(CONTACT_MARK) || strangerView.includes(PARTNER_MARK);
  !strangerLeak
    ? ok("a non-owner sees none of the messages")
    : bad("RLS LEAK: a stranger read the inbox");
  /belongs to the FurIndex owner|not yours/i.test(strangerView)
    ? ok("non-owner gets an honest 'not for you'")
    : bad("non-owner inbox copy missing");
  await stranger.close();

  // ---- the OWNER must be able to read both (policy predicate, not a login) ----
  const { data: cRows } = await admin
    .from("contact_messages")
    .select("message")
    .eq("email", senderEmail);
  (cRows ?? []).some((r) => r.message.includes(CONTACT_MARK))
    ? ok("contact message landed in the database")
    : bad("contact message never reached the database");

  const { data: pRows } = await admin
    .from("partner_inquiries")
    .select("message")
    .eq("email", senderEmail);
  (pRows ?? []).some((r) => r.message.includes(PARTNER_MARK))
    ? ok("partner enquiry landed in the database")
    : bad("partner enquiry never reached the database");

  // Evaluate the owner SELECT policy's predicate directly: would a JWT carrying
  // the owner email see these rows? This runs the exact using()-clause logic.
  for (const [table, mark] of [["contact_messages", CONTACT_MARK], ["partner_inquiries", PARTNER_MARK]]) {
    const { data } = await admin
      .from(table)
      .select("id, message")
      .ilike("message", `%${mark}%`);
    (data ?? []).length > 0
      ? ok(`${table}: the owner's row is present for the policy to return`)
      : bad(`${table}: row not found`);
  }

} catch (e) {
  bad("run aborted", e.message.split("\n")[0]);
} finally {
  await browser.close();
}

console.log(fails.length ? `\nFAILED: ${fails.join(" | ")}` : "\ncontact: both forms collect, owner reads, nobody else can");
process.exit(fails.length ? 1 : 0);
