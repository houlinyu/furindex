/**
 * Scores extraction over the 100-document labelled set (fixtures/bulk), both
 * ways: text-layer PDF (exact) and rasterised image via OCR (lossy).
 *
 * Runs the real pipeline directly — extractPdfText / ocrImage -> parseVetReport
 * — so it measures the extractor at scale without driving a browser 200 times.
 *
 *   npx tsx scripts/bulk-bench.mts [--pdf-only|--ocr-only] [N]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPdfText } from "../src/lib/pdf-text";
import { ocrImage } from "../src/lib/ocr";
import { parseVetReport } from "../src/lib/vet-parser";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "bulk");
const labels = JSON.parse(readFileSync(join(DIR, "bulk-labels.json"), "utf8")) as Record<string, any>;
const args = process.argv.slice(2);
const pdfOnly = args.includes("--pdf-only");
const ocrOnly = args.includes("--ocr-only");
const limit = Number(args.find((a) => /^\d+$/.test(a)) ?? Infinity);

type Field = "microchip" | "weight" | "vaccines" | "given" | "medications";
const CANON: Record<string, RegExp> = {
  rabies: /rabies/i, dhpp: /dhpp|da2?pp|distemper/i, bordetella: /bordetella/i,
  leptospirosis: /lepto/i, fvrcp: /fvrcp/i, felv: /felv|leukemia/i,
};

function score(report: any, label: any) {
  const per: Record<Field, [number, number]> = {
    microchip: [0, 0], weight: [0, 0], vaccines: [0, 0], given: [0, 0], medications: [0, 0],
  };
  const add = (f: Field, ok: boolean) => { per[f][1] += 1; if (ok) per[f][0] += 1; };

  add("microchip", report.pet?.microchip_id === label.microchip);
  if (typeof report.weight_kg === "number")
    add("weight", Math.abs(report.weight_kg - label.weight_kg) <= 0.15);
  else add("weight", false);

  const vnames = (report.vaccinations ?? []).map((v: any) => (v.name ?? "").toLowerCase());
  for (const want of label.vaccines) {
    const re = CANON[want.toLowerCase()] ?? new RegExp(want, "i");
    add("vaccines", vnames.some((n: string) => re.test(n)));
  }
  // given: at least one vaccination carries the administered date
  if (label.vaccines.length)
    add("given", (report.vaccinations ?? []).some((v: any) => v.administered_on === label.given));

  const mnames = (report.medications ?? []).map((m: any) => (m.name ?? "").toLowerCase());
  for (const want of label.medications)
    add("medications", mnames.some((n: string) => n.includes(want.split(" ")[0])));

  return per;
}

async function run(kind: "pdf" | "png") {
  const files = readdirSync(DIR).filter((f) => f.endsWith(`.${kind}`)).sort().slice(0, limit);
  const totals: Record<Field, [number, number]> = {
    microchip: [0, 0], weight: [0, 0], vaccines: [0, 0], given: [0, 0], medications: [0, 0],
  };
  let perfectDocs = 0;
  const perFormat: Record<string, [number, number]> = {};
  for (const f of files) {
    const label = labels[f];
    const bytes = new Uint8Array(readFileSync(join(DIR, f)));
    let text = "";
    try {
      text = kind === "pdf" ? (await extractPdfText(bytes)).text : (await ocrImage(bytes)).text;
    } catch { text = ""; }
    const report = parseVetReport(text, { source: kind === "pdf" ? "pdf-text" : "ocr" }).report;
    const per = score(report, label);
    let docOk = 0, docTot = 0;
    for (const k of Object.keys(per) as Field[]) {
      totals[k][0] += per[k][0]; totals[k][1] += per[k][1];
      docOk += per[k][0]; docTot += per[k][1];
    }
    if (docOk === docTot) perfectDocs += 1;
    perFormat[label.format] ??= [0, 0];
    perFormat[label.format][0] += docOk; perFormat[label.format][1] += docTot;
  }

  const pct = ([a, b]: [number, number]) => (b ? ((a / b) * 100).toFixed(1) + "%" : "—");
  console.log(`\n===== ${kind.toUpperCase()} (${files.length} docs) =====`);
  let allOk = 0, allTot = 0;
  for (const k of Object.keys(totals) as Field[]) {
    console.log(`  ${k.padEnd(12)} ${totals[k][0]}/${totals[k][1]}  (${pct(totals[k])})`);
    allOk += totals[k][0]; allTot += totals[k][1];
  }
  console.log(`  ${"OVERALL".padEnd(12)} ${allOk}/${allTot}  (${pct([allOk, allTot])})`);
  console.log(`  perfect docs: ${perfectDocs}/${files.length}`);
  console.log("  by format:");
  for (const [fmt, s] of Object.entries(perFormat).sort())
    console.log(`    ${fmt.padEnd(12)} ${pct(s)}`);
  return [allOk, allTot] as [number, number];
}

if (!ocrOnly) await run("pdf");
if (!pdfOnly) await run("png");
