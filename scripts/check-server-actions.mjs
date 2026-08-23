/**
 * Build-time guard for the two module-boundary rules that have each taken this
 * app down in production. Both build clean and type-check clean; both fail only
 * at request time, which is why they need a check of their own.
 *
 *   1. A "use server" module may export ONLY async functions.
 *      Next turns every export of such a module into a callable server
 *      reference. A constant exported next to the actions makes the whole
 *      module invalid and every page importing it 500s. (Commit e9fb36d: "Fix
 *      the dashboard 500: a 'use server' file exported a constant".)
 *
 *   2. A server module may not import a NON-COMPONENT value from a
 *      "use client" module.
 *      Importing a client *component* is normal and expected. Importing a
 *      plain value — a constant, a helper — from a client module into a server
 *      component throws when the page is rendered. Pure helpers go in
 *      src/lib/, which is what the rule is really asking for.
 *
 * Uppercase-initial imported bindings are treated as components and allowed;
 * that is the same convention JSX itself uses to tell the two apart.
 *
 * Deliberately regex-based, not a parser: it runs on every build and must not
 * add a dependency. It errs towards silence — it is a net, not a type system.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const SRC = resolve(process.cwd(), "src");
const problems = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const read = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

/** A directive only counts when it is the first statement of the module. */
const directive = (src, which) =>
  new RegExp(`^\\s*(?:/\\*[\\s\\S]*?\\*/\\s*|//.*\\n\\s*)*["']${which}["']`).test(src);

const isServerModule = (src) => directive(src, "use server");
const isClientModule = (src) => directive(src, "use client");

// ------------------------------------------------------------------ rule 1 --
for (const [file, src] of read) {
  if (!isServerModule(src)) continue;
  // Every `export` that is not `export async function` / `export type` /
  // `export interface` / a type-only re-export.
  const exportRe = /^export\s+(?!async\s+function\b)(?!type\b)(?!interface\b)(.*)$/gm;
  for (const m of src.matchAll(exportRe)) {
    const rest = m[1].trim();
    if (rest.startsWith("{ type ") || rest.startsWith("type ")) continue;
    problems.push(
      `${file}\n    "use server" module exports a non-async-function: export ${rest.slice(0, 70)}\n` +
        `    Only async functions may be exported. Move it to src/lib/.`
    );
  }
}

// ------------------------------------------------------------------ rule 2 --
const resolveImport = (fromFile, spec) => {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (read.has(base + ext)) return base + ext;
  }
  return read.has(base) ? base : null;
};

for (const [file, src] of read) {
  if (isClientModule(src)) continue; // client importing client is fine
  const importRe = /^import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
  for (const m of src.matchAll(importRe)) {
    const target = resolveImport(file, m[2]);
    if (!target || !isClientModule(read.get(target))) continue;

    const clause = m[1];
    const named = clause.match(/\{([\s\S]*)\}/)?.[1] ?? "";
    for (const raw of named.split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (!name || raw.trim().startsWith("type ")) continue;
      if (/^[A-Z]/.test(name)) continue; // a component — legal and normal
      problems.push(
        `${file}\n    imports the value \`${name}\` from the "use client" module ${m[2]}\n` +
          `    A server module may only import components from a client module. Move it to src/lib/.`
      );
    }
  }
}

if (problems.length) {
  console.error(`\ncheck-server-actions: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  process.exit(1);
}
console.log(`check-server-actions: ${read.size} files, no problems`);
