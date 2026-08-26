/**
 * "Do the saved records actually make sense?" — a plausibility audit.
 *
 * The bulk benchmark checks extraction against ground truth. This asks a
 * different, safety-focused question: of everything the parser DID surface
 * (PDF and OCR, all 150 docs), is any value nonsensical — a wrong-length
 * microchip, an impossible body weight, a date far outside a real record, a
 * vaccine or medication name that is garbage or a stray price? A field left
 * blank is fine (the human fills it); a field filled with nonsense is not,
 * because it would be saved onto a pet's medical record.
 *
 *   npx tsx scripts/sanity-audit.mts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractPdfText } from "../src/lib/pdf-text";
import { ocrImage } from "../src/lib/ocr";
import { parseVetReport } from "../src/lib/vet-parser";

const DIR = "fixtures/bulk";
const KNOWN_VAX = /rabies|dhpp|da2?pp|distemper|bordetella|lepto|fvrcp|felv|leukemia|parvo|nobivac/i;
const problems: string[] = [];
const flag = (f: string, msg: string) => problems.push(`${f}: ${msg}`);

function audit(f: string, r: any) {
  const chip = r.pet?.microchip_id;
  if (chip != null && !/^[0-9]{9,10}$|^[0-9]{15}$|^[A-Za-z0-9]{9,10}$/.test(chip))
    flag(f, `implausible microchip "${chip}"`);

  if (r.weight_kg != null && (typeof r.weight_kg !== "number" || r.weight_kg < 0.05 || r.weight_kg > 150))
    flag(f, `implausible weight ${r.weight_kg} kg`);

  const dateOk = (d: string | null) => d == null || (/^\d{4}-\d{2}-\d{2}$/.test(d) && +d.slice(0, 4) >= 2000 && +d.slice(0, 4) <= 2035);
  for (const v of r.vaccinations ?? []) {
    if (!v.name || v.name.length < 3 || /[$£€\d]{2,}/.test(v.name)) flag(f, `garbage vaccine name "${v.name}"`);
    else if (!KNOWN_VAX.test(v.name)) flag(f, `unrecognised vaccine name "${v.name}"`);
    if (!dateOk(v.administered_on)) flag(f, `bad administered date "${v.administered_on}" on ${v.name}`);
    if (!dateOk(v.due_on)) flag(f, `bad due date "${v.due_on}" on ${v.name}`);
    if (v.administered_on && v.due_on && v.due_on < v.administered_on) flag(f, `due before given on ${v.name}`);
    if (v.lot_number && /[$£€]/.test(v.lot_number)) flag(f, `price in lot number "${v.lot_number}"`);
  }
  for (const m of r.medications ?? []) {
    if (!m.name || m.name.length < 3 || !/[A-Za-z]{3}/.test(m.name)) flag(f, `garbage medication name "${m.name}"`);
    if (/[$£€]|\bUSD\b/.test(m.name) || /[$£€]/.test(m.dose ?? "") || /[$£€]/.test(m.frequency ?? ""))
      flag(f, `price bled into medication "${m.name}" / "${m.dose}" / "${m.frequency}"`);
  }
}

for (const kind of ["pdf", "png"] as const) {
  const files = readdirSync(DIR).filter((f) => f.endsWith(`.${kind}`)).sort();
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(join(DIR, f)));
    let text = "";
    try { text = kind === "pdf" ? (await extractPdfText(bytes)).text : (await ocrImage(bytes)).text; } catch {}
    const r = parseVetReport(text, { source: kind === "pdf" ? "pdf-text" : "ocr" }).report;
    audit(`${f}`, r);
  }
  console.log(`audited ${files.length} ${kind} docs`);
}

if (problems.length) {
  console.log(`\n${problems.length} nonsensical value(s) found:`);
  for (const p of problems) console.log("  BAD " + p);
  process.exit(1);
} else {
  console.log("\nsanity audit: every value the parser surfaced (PDF + OCR) is plausible — no nonsense reaches a record");
}
