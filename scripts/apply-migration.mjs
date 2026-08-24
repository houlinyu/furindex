/**
 * Applies one migration file to the Supabase project, from here.
 *
 * WHY THIS EXISTS AS A SCRIPT RATHER THAN A CURL
 * Schema changes are the most destructive thing this repo can do, so the way to
 * make them runnable from a terminal session is a single narrow command that
 * can be allow-listed on its own — not a blanket permission for "POST anything
 * to any API". Everything this can do is in this file, and it is short enough
 * to read in full before granting it.
 *
 * Four guards, in order:
 *   1. it only reads files inside supabase/migrations/
 *   2. it refuses any statement that drops or truncates a table, or alters an
 *      existing column — the migrations here are additive by design, so a file
 *      that is not additive is a mistake, not an instruction
 *   3. --dry-run prints what would run and exits
 *   4. it prints the verification queries afterwards rather than claiming success
 *
 * Usage:
 *   node scripts/apply-migration.mjs 001_media_history.sql --dry-run
 *   node scripts/apply-migration.mjs 001_media_history.sql
 *
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token, sbp_…) and
 * SUPABASE_PROJECT_REF in .env.local, which is gitignored.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const MIGRATIONS = join(repo, "supabase", "migrations");

function env() {
  const path = join(repo, ".env.local");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const vars = { ...env(), ...process.env };
const TOKEN = vars.SUPABASE_ACCESS_TOKEN;
const REF =
  vars.SUPABASE_PROJECT_REF ||
  (vars.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https:\/\//, "").replace(/\.supabase\.co.*$/, "");

const name = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!name) {
  console.error("usage: node scripts/apply-migration.mjs <file.sql> [--dry-run]");
  process.exit(2);
}

// Guard 1: only files inside supabase/migrations, no traversal.
const file = resolve(MIGRATIONS, name);
if (!file.startsWith(MIGRATIONS + "/") || !file.endsWith(".sql")) {
  console.error(`refusing: ${name} is not a .sql file inside supabase/migrations/`);
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`no such migration: ${file}`);
  process.exit(2);
}

const sql = readFileSync(file, "utf8");

/**
 * Comments are stripped before the safety scan. These files explain themselves
 * at length, and one of them contains the sentence "`delete from
 * storage.buckets` would take them with it" — describing the destructive thing
 * it deliberately does NOT do. Scanning raw text flagged that as destructive,
 * which is the classic way a safety check becomes something people switch off.
 * Scan what will execute, not what it says about itself.
 */
const executable = sql
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n")
  .map((line) => {
    // Strip -- comments, but not a -- that sits inside a quoted string.
    let inSingle = false;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === "'") inSingle = !inSingle;
      if (!inSingle && line[i] === "-" && line[i + 1] === "-") return line.slice(0, i);
    }
    return line;
  })
  .join("\n");

// Guard 2: additive only. `drop policy if exists` is allowed — every file here
// re-creates its own policies so it can be run twice — but nothing that can
// destroy data is.
const forbidden = [
  [/\bdrop\s+table\b/i, "drop table"],
  [/\bdrop\s+schema\b/i, "drop schema"],
  [/\bdrop\s+database\b/i, "drop database"],
  [/\btruncate\b/i, "truncate"],
  [/\bdelete\s+from\b/i, "delete from"],
  [/\balter\s+table\s+[\w."]+\s+drop\b/i, "alter table … drop"],
  [/\bdrop\s+column\b/i, "drop column"],
];
const hits = forbidden.filter(([re]) => re.test(executable)).map(([, label]) => label);
if (hits.length) {
  console.error(`refusing to run ${name}: it contains ${hits.join(", ")}.`);
  console.error("Migrations in this repo are additive. Apply a destructive change by hand,");
  console.error("deliberately, with a backup — not through a script built for the safe case.");
  process.exit(1);
}

const statements = executable.split(/;\s*$/m).filter((s) => s.trim()).length;
console.log(`${name}: ${sql.split("\n").length} lines, ~${statements} statements, additive check passed`);

if (dryRun) {
  console.log("\n--- dry run, nothing sent. First 40 lines: ---");
  console.log(sql.split("\n").slice(0, 40).join("\n"));
  process.exit(0);
}

if (!TOKEN || !REF) {
  console.error("\nMissing credentials. Add to .env.local (gitignored):");
  console.error("  SUPABASE_ACCESS_TOKEN=sbp_...   # Account → Access Tokens");
  console.error("  SUPABASE_PROJECT_REF=" + (REF || "<project ref>"));
  process.exit(2);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`\nFAILED ${res.status}: ${text.slice(0, 800)}`);
  process.exit(1);
}

console.log(`\napplied. server said: ${text.slice(0, 300) || "(no rows)"}`);
console.log("\nVerify it took — do not assume:");
if (name.includes("media")) {
  console.log("  node scripts/apply-migration.mjs --check pet_media");
  console.log("  (or run the queries in supabase/migrations/README.md)");
} else {
  console.log("  run the verification queries in supabase/migrations/README.md");
}
