/**
 * A "use server" module may export ONLY async functions. Anything else — a
 * const, a class, a plain object — throws at REQUEST time in production while
 * building perfectly cleanly. That is how `export const HIT_ICON` took the
 * dashboard down: green build, green types, 500 for every signed-in user.
 *
 * Types are erased before this rule applies, so `export type` is fine.
 *
 *   node scripts/check-server-actions.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const offences = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules" && entry !== ".next") walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;

    const src = readFileSync(full, "utf8");
    // Only a MODULE-level directive makes the whole file a server-action module.
    // An inline "use server" inside a function body is a different thing and is
    // perfectly legal in a server component that also has a default export.
    const firstCode = src
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
    if (!firstCode || !/^["']use server["']/.test(firstCode)) continue;

    src.split("\n").forEach((line, i) => {
      const m = line.match(/^export\s+(const|let|var|class|default)\b/);
      // `export async function` and `export type` are the only legal shapes.
      if (m) offences.push(`${full}:${i + 1}  export ${m[1]} …`);
      const fn = line.match(/^export\s+function\s/);
      if (fn) offences.push(`${full}:${i + 1}  export function … (must be async)`);
    });
  }
}

walk("src");

if (offences.length) {
  console.error('A "use server" file may only export async functions:\n');
  offences.forEach((o) => console.error("  " + o));
  console.error("\nMove constants and types into src/lib/ instead.");
  process.exit(1);
}
console.log('"use server" exports are all async functions ✓');
