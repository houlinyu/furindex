/**
 * Accessibility and mobile-layout sweep across every page, in both themes and
 * at two widths.
 *
 * Deliberately checks only things that are unambiguously wrong and can be
 * verified from the DOM — an unlabelled input, a control with no accessible
 * name, an image with no alt, a second <h1>, a page that scrolls sideways on a
 * phone. No heuristics about whether copy is "clear", because a checker that
 * cries wolf gets ignored, and then the real findings go with it.
 *
 *   node scripts/a11y-check.mjs <base-url> [password]
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const GATE = process.argv[3] ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/home/hyu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";

const findings = [];
const note = (page, kind, detail) => findings.push({ page, kind, detail });

const AUDIT = () => {
  const out = [];
  const text = (el) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const named = (el) =>
    text(el) ||
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    (el.getAttribute("aria-labelledby") &&
      document.getElementById(el.getAttribute("aria-labelledby"))) ||
    el.querySelector("img[alt]:not([alt=''])") ||
    el.querySelector("svg title");

  // Images must say what they are, or explicitly say they are decorative.
  for (const img of document.querySelectorAll("img")) {
    if (img.getAttribute("alt") === null) {
      out.push(["img-no-alt", (img.getAttribute("src") ?? "").slice(0, 60)]);
    }
  }

  // Every field needs a programmatic label, not just placeholder text.
  for (const el of document.querySelectorAll("input, select, textarea")) {
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    if (type === "hidden") continue;
    const id = el.getAttribute("id");
    const hasLabel =
      (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      el.closest("label") ||
      el.getAttribute("aria-label") ||
      el.getAttribute("aria-labelledby");
    if (!hasLabel) {
      out.push([
        "field-no-label",
        `${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? "?"}]` +
          (el.getAttribute("placeholder") ? ` placeholder="${el.getAttribute("placeholder")}"` : ""),
      ]);
    }
  }

  // A control a screen reader announces as just "button" is unusable.
  for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
    if (el.getAttribute("aria-hidden") === "true") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (!named(el)) out.push(["control-unnamed", el.outerHTML.slice(0, 90)]);
  }

  const h1s = [...document.querySelectorAll("h1")];
  if (h1s.length === 0) out.push(["no-h1", ""]);
  if (h1s.length > 1) out.push(["multiple-h1", h1s.map(text).join(" | ").slice(0, 90)]);

  // Skipped heading levels break outline navigation.
  const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) =>
    Number(h.tagName[1])
  );
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] - levels[i - 1] > 1) {
      out.push(["heading-jump", `h${levels[i - 1]} → h${levels[i]}`]);
      break;
    }
  }

  // Tap targets. 24px is the WCAG 2.2 AA minimum (2.5.8, Target Size Minimum).
  //
  // The "Inline" exception is honoured: a link sitting inside a sentence is
  // explicitly exempt, because its height is set by the line-height of the text
  // around it and growing it would break the paragraph. Reporting those anyway
  // is how a checker becomes noise — and then the real findings go unread with
  // the rest. A control is treated as inline when its parent holds meaningful
  // text besides the control itself.
  const isInline = (el) => {
    const parent = el.parentElement;
    if (!parent) return false;
    const own = text(el);
    const surrounding = text(parent).replace(own, "").replace(/[\s·.,—–|]/g, "");
    return surrounding.length > 0;
  };

  for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 24 && text(el).length > 0 && !isInline(el)) {
      out.push(["small-target", `${Math.round(r.height)}px "${text(el).slice(0, 40)}"`]);
    }
  }

  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    // Name the widest offender — "the page scrolls sideways" is not actionable.
    let worst = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 1 && (!worst || r.right > worst.right)) {
        worst = { right: r.right, html: el.outerHTML.slice(0, 80) };
      }
    }
    out.push([
      "h-overflow",
      `${doc.scrollWidth}>${doc.clientWidth} widest: ${worst?.html ?? "unknown"}`,
    ]);
  }

  return out;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });

async function session(width, theme) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: theme,
  });
  if (GATE) await ctx.addCookies([{ name: "site_gate", value: GATE, url: BASE }]);
  const page = await ctx.newPage();
  const email = `a11y-${width}-${theme}-${Date.now()}@furindex-test.com`;
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "a11y-password-123");
  await Promise.all([
    page.waitForURL(/dashboard/, { timeout: 40000 }),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);
  await page.goto(`${BASE}/pets/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', "Audit");
  await Promise.all([
    page.waitForURL(/\/pets\/[0-9a-f-]{36}/, { timeout: 40000 }),
    page.getByRole("button", { name: /save pet/i }).click(),
  ]);
  return { ctx, page, petUrl: new URL(page.url()).pathname };
}

try {
  for (const width of [1280, 390]) {
    for (const theme of ["light", "dark"]) {
      const { ctx, page, petUrl } = await session(width, theme);
      const paths = [
        "/",
        "/compare",
        "/collaborate",
        "/writing",
        "/writing/the-feature-we-didnt-build",
        "/login",
        "/dashboard",
        "/pets",
        petUrl,
        `${petUrl}/edit`,
        `${petUrl}/summary`,
        `${petUrl}/profile`,
        "/community",
        "/account",
        "/pets/new",
        "/start",
      ];
      for (const path of paths) {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => {});
        await page.waitForTimeout(250);
        const issues = await page.evaluate(AUDIT);
        for (const [kind, detail] of issues) {
          note(`${path} @${width}/${theme}`, kind, detail);
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

// Group by kind: one wrong shared component shows up on twelve pages, and a
// per-page list would bury the fact that it is one fix.
const byKind = new Map();
for (const f of findings) {
  if (!byKind.has(f.kind)) byKind.set(f.kind, []);
  byKind.get(f.kind).push(f);
}

if (findings.length === 0) {
  console.log("a11y: no findings");
} else {
  console.log(`a11y: ${findings.length} findings across ${byKind.size} kinds\n`);
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${kind}  (${list.length})`);
    const seen = new Set();
    for (const f of list) {
      const key = f.detail;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`    ${f.page}\n      ${f.detail}`);
      if (seen.size >= 20) {
        const more = new Set(list.map((x) => x.detail)).size - seen.size;
        if (more > 0) console.log(`    … ${more} more distinct`);
        break;
      }
    }
    console.log("");
  }
}
process.exit(findings.length ? 1 : 0);
