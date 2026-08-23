/**
 * Measures the local extractor against the fixtures, field by field, against
 * what the document actually says.
 *
 *   node fixtures/make-pdfs.mjs && python3 fixtures/make-images.py
 *   npx tsx scripts/test-extraction-local.ts
 *
 * Every field lands in one of four buckets:
 *   ok      — matches the document
 *   missed  — the document says it, we returned null (a safe failure)
 *   WRONG   — we returned something the document does not say (the bad one)
 *   extra   — we returned a record the document does not contain
 *
 * The exit code is non-zero only if a fixture's headline expectation breaks
 * (unreadable flag, confidence ceiling, or a WRONG in a dosage), because those
 * are the failures that would put a bad record in front of an owner as if it
 * were fine.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scanReportLocalDetailed } from "../src/lib/extraction-local";
import type { ExtractedReport } from "../src/lib/extraction";

const OUT = join(process.cwd(), "fixtures", "out");

type Truth = {
  file: string;
  mime: string;
  what: string;
  /** What the document actually says. undefined = not asserted. */
  expect: {
    unreadable: boolean;
    maxConfidence?: "high" | "medium" | "low";
    name?: string | null;
    species?: string | null;
    breed?: string | null;
    sex?: string | null;
    birth_date?: string | null;
    microchip?: string | null;
    clinic?: string | null;
    visit_date?: string | null;
    cost_usd?: number | null;
    weight_kg?: number | null;
    vaccinations?: Array<{ name: string; administered_on: string | null; due_on: string | null; lot_number: string | null }>;
    medications?: Array<{ name: string; dosage: string | null; frequency: string | null }>;
  };
};

const CONF_RANK = { low: 0, medium: 1, high: 2 };

const FIXTURES: Truth[] = [
  {
    file: "f1-invoice-textlayer.pdf",
    mime: "application/pdf",
    what: "US clinic invoice, digitally generated, real text layer",
    expect: {
      unreadable: false,
      name: "Mochi",
      species: "dog",
      breed: "Shiba Inu",
      sex: "female",
      birth_date: "2021-04-18",
      microchip: "985141002317744",
      clinic: "Cambridge Veterinary Associates",
      visit_date: "2026-08-14",
      cost_usd: 284.5,
      weight_kg: 9.39, // 20.7 lb
      vaccinations: [
        { name: "Rabies", administered_on: "2026-08-14", due_on: "2029-08-14", lot_number: "RB-4471902" },
        { name: "DHPP", administered_on: "2026-08-14", due_on: "2027-08-14", lot_number: "DH-8820134" },
        { name: "Bordetella", administered_on: "2026-08-14", due_on: "2027-02-14", lot_number: "BD-3312007" },
      ],
      medications: [
        { name: "Apoquel (oclacitinib)", dosage: "5.4 mg", frequency: "twice daily for 14 days" },
        { name: "Simparica Trio 10-20 kg chewable", dosage: "1 chewable", frequency: "every 30 days" },
      ],
    },
  },
  {
    file: "f5-discharge-uk.pdf",
    mime: "application/pdf",
    what: "UK discharge summary — day/month dates, £ total",
    expect: {
      unreadable: false,
      maxConfidence: "medium",
      name: "Biscuit",
      species: "cat",
      breed: "Domestic Shorthair",
      sex: "male",
      birth_date: "2019-09-11",
      microchip: "981020012345678",
      clinic: "Bristol Veterinary Centre",
      visit_date: "2026-04-03",
      cost_usd: null, // £142.60 is not dollars and must not be converted
      weight_kg: 4.6,
      vaccinations: [
        { name: "FVRCP", administered_on: "2026-04-03", due_on: "2027-04-03", lot_number: "2026A-778" },
      ],
      medications: [
        { name: "Metacam (meloxicam)", dosage: "0.3 ml", frequency: "once daily for 5 days" },
      ],
    },
  },
  {
    file: "f2-vaccination-card.png",
    mime: "image/png",
    what: "printed vaccination card, photographed (OCR)",
    expect: {
      unreadable: false,
      maxConfidence: "medium",
      name: "Pepper",
      species: "cat",
      breed: "Domestic Shorthair",
      sex: "female",
      birth_date: "2022-06-09",
      microchip: "981020012345678",
      clinic: "BROOKLINE ANIMAL HOSPITAL",
      visit_date: "2026-01-22",
      cost_usd: 196.0,
      weight_kg: 4.22, // 9.3 lb
      vaccinations: [
        { name: "FVRCP", administered_on: "2026-01-22", due_on: "2027-01-22", lot_number: "FV-91188" },
        { name: "Rabies", administered_on: "2026-01-22", due_on: "2027-01-22", lot_number: "RB-2210044" },
        { name: "FeLV", administered_on: "2026-01-22", due_on: "2027-01-22", lot_number: "FL-77120" },
      ],
      medications: [{ name: "Revolution Plus", dosage: "1 tube", frequency: "monthly" }],
    },
  },
  {
    file: "f3-handwritten-note.png",
    mime: "image/png",
    what: "handwritten chart note (OCR's worst case)",
    expect: {
      unreadable: false,
      maxConfidence: "low",
      name: "Sunny",
      species: "dog",
      breed: "Golden Retriever",
      sex: "male",
      visit_date: "2026-08-02",
      weight_kg: 28.12, // 62 lb
      vaccinations: [
        { name: "Rabies", administered_on: "2026-08-02", due_on: null, lot_number: "7741" },
        { name: "DHPP", administered_on: null, due_on: "2027-08-02", lot_number: null },
      ],
      medications: [{ name: "Carprofen", dosage: "75mg", frequency: "BID x 7d" }],
    },
  },
  {
    file: "f4-hardware-receipt.pdf",
    mime: "application/pdf",
    what: "NOT a vet report — hardware store receipt",
    expect: { unreadable: true },
  },
  {
    file: "f7-blurry-card.png",
    mime: "image/png",
    what: "the same vaccination card, badly photographed",
    expect: { unreadable: true },
  },
  {
    file: "f6-scanned-invoice.png",
    mime: "image/png",
    what: "the F1 invoice printed, scanned, and OCR'd — same ground truth as F1",
    expect: {
      unreadable: false,
      maxConfidence: "medium",
      name: "Mochi",
      species: "dog",
      breed: "Shiba Inu",
      sex: "female",
      birth_date: "2021-04-18",
      microchip: "985141002317744",
      clinic: "Cambridge Veterinary Associates",
      visit_date: "2026-08-14",
      cost_usd: 284.5,
      weight_kg: 9.39,
      vaccinations: [
        { name: "Rabies", administered_on: "2026-08-14", due_on: "2029-08-14", lot_number: "RB-4471902" },
        { name: "DHPP", administered_on: "2026-08-14", due_on: "2027-08-14", lot_number: "DH-8820134" },
        { name: "Bordetella", administered_on: "2026-08-14", due_on: "2027-02-14", lot_number: "BD-3312007" },
      ],
      medications: [
        { name: "Apoquel (oclacitinib)", dosage: "5.4 mg", frequency: "twice daily for 14 days" },
        { name: "Simparica Trio 10-20 kg chewable", dosage: "1 chewable", frequency: "every 30 days" },
      ],
    },
  },
  {
    file: "f6-scanned-invoice.pdf",
    mime: "application/pdf",
    what: "the same scan wrapped in a PDF — no text layer",
    expect: { unreadable: true },
  },
];

type Verdict = "ok" | "missed" | "WRONG" | "extra";
const tally: Record<Verdict, number> = { ok: 0, missed: 0, WRONG: 0, extra: 0 };
let failures = 0;

function norm(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return String(v);
  return String(v).replace(/\s+/g, " ").trim();
}

function loose(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.02;
  const x = norm(a).toLowerCase();
  const y = norm(b).toLowerCase();
  return x === y || x.startsWith(y) || y.startsWith(x);
}

function check(field: string, expected: unknown, got: unknown, rows: string[][]) {
  if (expected === undefined) return;
  let v: Verdict;
  if (loose(expected, got)) v = "ok";
  else if (got == null) v = "missed";
  else if (expected == null) v = "extra";
  else v = "WRONG";
  tally[v]++;
  rows.push([field, norm(expected), norm(got), v]);
  return v;
}

function table(rows: string[][]) {
  const w = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) {
    const mark = r[3] === "ok" ? "  ok  " : r[3] === "missed" ? " miss " : r[3] === "extra" ? " extra" : " WRONG";
    console.log(`  ${mark} │ ${r[0].padEnd(w[0])} │ document: ${r[1].padEnd(w[1])} │ got: ${r[2]}`);
  }
}

async function run(f: Truth) {
  const path = join(OUT, f.file);
  console.log("\n" + "═".repeat(96));
  console.log(`${f.file}  —  ${f.what}`);
  console.log("═".repeat(96));
  if (!existsSync(path)) {
    console.log("  fixture missing — run the generators first");
    failures++;
    return;
  }
  const bytes = new Uint8Array(readFileSync(path));

  let report: ExtractedReport;
  let detail;
  try {
    const res = await scanReportLocalDetailed(bytes, f.mime);
    report = res.report;
    detail = res.detail;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (f.expect.unreadable) {
      console.log(`  ok   │ refused, with a usable reason: "${message}"`);
      tally.ok++;
    } else {
      console.log(`  FAIL │ threw: ${message}`);
      failures++;
    }
    return;
  }

  console.log(
    `  layer=${detail.layer}  ${detail.ocrConfidence != null ? `ocr-conf=${detail.ocrConfidence.toFixed(0)}%  ` : ""}` +
      `${detail.ms} ms  confidence=${report.confidence}  unreadable=${report.unreadable}`
  );

  if (report.unreadable !== f.expect.unreadable) {
    console.log(`  FAIL │ unreadable should be ${f.expect.unreadable}, got ${report.unreadable}`);
    failures++;
  }
  if (f.expect.unreadable) {
    if (report.unreadable) {
      console.log("  ok   │ correctly refused");
      tally.ok++;
    }
    console.log(`  note │ ${report.notes ?? "(none)"}`);
    return;
  }
  if (f.expect.maxConfidence && CONF_RANK[report.confidence] > CONF_RANK[f.expect.maxConfidence]) {
    console.log(`  FAIL │ confidence ${report.confidence} is above the honest ceiling ${f.expect.maxConfidence}`);
    failures++;
  }

  const rows: string[][] = [];
  check("pet.name", f.expect.name, report.pet.name, rows);
  check("pet.species", f.expect.species, report.pet.species, rows);
  check("pet.breed", f.expect.breed, report.pet.breed, rows);
  check("pet.sex", f.expect.sex, report.pet.sex, rows);
  check("pet.birth_date", f.expect.birth_date, report.pet.birth_date, rows);
  check("pet.microchip", f.expect.microchip, report.pet.microchip_id, rows);
  check("clinic_name", f.expect.clinic, report.clinic_name, rows);
  check("visit_date", f.expect.visit_date, report.visit_date, rows);
  check("cost_usd", f.expect.cost_usd, report.cost_usd, rows);
  check("weight_kg", f.expect.weight_kg, report.weight_kg, rows);

  for (const want of f.expect.vaccinations ?? []) {
    const got = report.vaccinations.find((v) => v.name.toLowerCase() === want.name.toLowerCase());
    if (!got) {
      rows.push([`vaccine ${want.name}`, "present", "—", "missed"]);
      tally.missed++;
      continue;
    }
    check(`vaccine ${want.name}: given`, want.administered_on, got.administered_on, rows);
    check(`vaccine ${want.name}: due`, want.due_on, got.due_on, rows);
    check(`vaccine ${want.name}: lot`, want.lot_number, got.lot_number, rows);
  }
  for (const got of report.vaccinations) {
    if (!(f.expect.vaccinations ?? []).some((w) => w.name.toLowerCase() === got.name.toLowerCase())) {
      rows.push([`vaccine ${got.name}`, "not in document", got.name, "extra"]);
      tally.extra++;
    }
  }

  for (const want of f.expect.medications ?? []) {
    const got = report.medications.find((m) =>
      m.name.toLowerCase().includes(want.name.toLowerCase().split(" ")[0])
    );
    if (!got) {
      rows.push([`med ${want.name}`, "present", "—", "missed"]);
      tally.missed++;
      continue;
    }
    check(`med ${want.name}: name`, want.name, got.name, rows);
    const v = check(`med ${want.name}: dosage`, want.dosage, got.dosage, rows);
    if (v === "WRONG" && detail.layer === "ocr" && report.confidence !== "low") {
      console.log("  FAIL │ a misread dosage escaped with confidence above low");
      failures++;
    }
    check(`med ${want.name}: frequency`, want.frequency, got.frequency, rows);
  }
  for (const got of report.medications) {
    if (
      !(f.expect.medications ?? []).some((w) =>
        got.name.toLowerCase().includes(w.name.toLowerCase().split(" ")[0])
      )
    ) {
      rows.push([`med "${got.name}"`, "not in document", got.dosage ?? "—", "extra"]);
      tally.extra++;
    }
  }

  table(rows);
  if (report.additional_fields.length) {
    console.log(
      "  other  │ " +
        report.additional_fields.map((a) => `${a.label}=${a.value}${a.unit ?? ""}`).join("  ·  ")
    );
  }
  console.log(`  note   │ ${(report.notes ?? "(none)").replace(/\n+/g, " ⏎ ")}`);
}

async function main() {
  for (const f of FIXTURES) await run(f);
  console.log("\n" + "═".repeat(96));
  console.log(
    `TOTAL  ok=${tally.ok}  missed=${tally.missed}  WRONG=${tally.WRONG}  extra=${tally.extra}` +
      `   (missed is a safe failure; WRONG is not)`
  );
  console.log("═".repeat(96));
  if (failures) {
    console.log(`\n${failures} headline expectation(s) broke.`);
    process.exit(1);
  }
}

main();
