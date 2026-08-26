/**
 * Generates a large, LABELLED benchmark set of vet documents — the same content
 * rendered two ways: a text-layer PDF and a clean rasterised image (a stand-in
 * for a photo, read by OCR). Every document carries known ground truth in
 * bulk-labels.json, so extraction can be scored field-by-field at scale.
 *
 * The content is randomised across real formats (certificate, tabular record,
 * EU passport, itemised invoice, discharge note, boarding form), date styles,
 * vaccine sets, weights in kg and lb, lot styles and microchips — but from a
 * FIXED seed, so the set is reproducible and a regression is a real regression.
 *
 *   node fixtures/make-bulk.mjs [count]     (default 100)
 */
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COUNT = Number(process.argv[2] ?? 100);
const OUT = join(dirname(fileURLToPath(import.meta.url)), "bulk");
mkdirSync(OUT, { recursive: true });

// --- deterministic RNG (mulberry32) so the set is reproducible --------------
let seed = 0x9e3779b9;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOG_VAX = ["Rabies", "DHPP", "Bordetella", "Leptospirosis"];
const CAT_VAX = ["Rabies", "FVRCP", "FeLV"];
const CLINICS = ["Somerville Animal Hospital", "Riverside Veterinary Group", "Downtown Pet Clinic",
  "Cambridge Veterinary Associates", "Harbor Animal Care", "Elm Street Vets"];
const DOG_BREEDS = ["Labrador Retriever", "German Shepherd", "Beagle", "Poodle", "Boxer"];
const CAT_BREEDS = ["British Shorthair", "Maine Coon", "Siamese", "Domestic Shorthair"];
const MEDS = [["Apoquel", "5.4 mg", "twice daily"], ["Simparica Trio", "1 chewable", "every 30 days"],
  ["Heartgard Plus", "1 chewable", "monthly"], ["Revolution Plus", "1 dose", "monthly"],
  ["Carprofen", "75 mg", "once daily"]];

/** Format a Y-M-D triple in one of several real styles; returns {shown, iso}. */
function fmtDate(y, m, d, style) {
  const pad = (n) => String(n).padStart(2, "0");
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  switch (style) {
    case "mdy": return { shown: `${pad(m)}/${pad(d)}/${y}`, iso };
    case "dmy": return { shown: `${pad(d)}/${pad(m)}/${y}`, iso };
    case "iso": return { shown: iso, iso };
    case "dotdmy": return { shown: `${pad(d)}.${pad(m)}.${y}`, iso };
    case "monthword": return { shown: `${d} ${MONTHS[m - 1]} ${y}`, iso };
    default: return { shown: iso, iso };
  }
}

function microchip() {
  let s = "";
  for (let i = 0; i < 15; i += 1) s += int(0, 9);
  return s;
}
function lot() {
  const styles = [
    () => `${pick(["RB", "DH", "FV", "LP"])}-${int(1000000, 9999999)}`,
    () => String(int(100000, 999999)),
    () => `${pick("ABCDEFGH")}${int(100, 999)}${pick("ABCDEFGH")}`,
  ];
  return pick(styles)();
}

/** Build one labelled document as an array of text lines + its ground truth. */
function buildDoc(i) {
  const species = chance(0.55) ? "dog" : "cat";
  const breed = species === "dog" ? pick(DOG_BREEDS) : pick(CAT_BREEDS);
  const pool = species === "dog" ? DOG_VAX : CAT_VAX;
  const nVax = int(1, pool.length);
  const vaccines = [...pool].sort(() => rnd() - 0.5).slice(0, nVax);
  const style = pick(["mdy", "dmy", "iso", "dotdmy", "monthword"]);
  const clinic = pick(CLINICS);
  const chip = microchip();
  const weightKg = +(species === "dog" ? int(80, 400) / 10 : int(28, 70) / 10).toFixed(1);
  const useLb = chance(0.35);
  const weightShown = useLb ? `${(weightKg / 0.453592).toFixed(1)} lb` : `${weightKg} kg`;
  const gy = 2026, gm = int(1, 12), gd = int(13, 28); // day>12: date order is unambiguous
  const given = fmtDate(gy, gm, gd, style);
  const due = fmtDate(gy + 1, gm, gd, style);
  const format = pick(["certificate", "tabular", "passport", "invoice", "discharge", "boarding"]);
  const meds = [];
  const nMed = int(0, 2);
  for (let k = 0; k < nMed; k += 1) meds.push(pick(MEDS));

  const lines = [];
  const label = {
    species, microchip: chip, weight_kg: weightKg,
    vaccines, given: given.iso, medications: meds.map((m) => m[0].toLowerCase()),
    format,
  };
  const lotFor = {};
  for (const v of vaccines) lotFor[v] = lot();

  if (format === "certificate" || format === "passport") {
    // Single-vaccine cert/passport: force one vaccine, fields on labelled lines.
    const v = vaccines[0];
    label.vaccines = [v];
    if (format === "passport") {
      lines.push("EUROPEAN PET PASSPORT - VACCINATION AGAINST RABIES");
      lines.push(`Name of animal: Pet${i}  Species: ${species}  Breed: ${breed}`);
      lines.push(`Transponder (microchip): ${chip}`);
      lines.push(`Manufacturer and name of vaccine: Nobivac ${v}`);
      lines.push(`Batch number: ${lotFor[v]}`);
      lines.push(`Date of vaccination: ${given.shown}`);
      lines.push(`Valid until: ${due.shown}`);
    } else {
      lines.push(`${v.toUpperCase()} VACCINATION CERTIFICATE`);
      lines.push(`Animal: Pet${i}  Species: ${species}  Breed: ${breed}`);
      lines.push(`Microchip No.: ${chip}`);
      lines.push(`Vaccine: ${v}`);
      lines.push(`Date Administered: ${given.shown}`);
      lines.push(`Next Due: ${due.shown}`);
      lines.push(`Lot No.: ${lotFor[v]}`);
    }
    lines.push(`Weight: ${weightShown}`);
    label.medications = [];
  } else if (format === "tabular") {
    lines.push("VACCINATION RECORD");
    lines.push(`${clinic}  -  Patient: Pet${i}  -  ${species}  -  Microchip: ${chip}`);
    lines.push("Vaccine            Date Given     Next Due       Lot");
    for (const v of vaccines) lines.push(`${v.padEnd(18)} ${given.shown.padEnd(14)} ${due.shown.padEnd(14)} ${lotFor[v]}`);
    lines.push(`Weight: ${weightShown}`);
    for (const m of meds) lines.push(`${m[0]} ${m[1]} - ${m[2]}`);
  } else if (format === "invoice") {
    lines.push(`INVOICE - ${clinic}`);
    lines.push(`Patient: Pet${i}  ${species}  Microchip: ${chip}`);
    lines.push(`Date of service: ${given.shown}`);
    for (const v of vaccines) lines.push(`${v} vaccination given ${given.shown}  lot ${lotFor[v]}   $${int(25, 65)}.00`);
    for (const m of meds) lines.push(`${m[0]} ${m[1]} - ${m[2]}   $${int(20, 60)}.00`);
    lines.push(`Weight recorded: ${weightShown}`);
  } else if (format === "discharge") {
    lines.push(`${clinic} - Discharge Summary`);
    lines.push(`Patient: Pet${i} (${species}, ${breed})  Microchip: ${chip}`);
    lines.push(`Seen: ${given.shown}   Weight: ${weightShown}`);
    lines.push("Vaccinations given today:");
    for (const v of vaccines) lines.push(`  ${v} - next due ${due.shown} (lot ${lotFor[v]})`);
    lines.push("Medications dispensed:");
    for (const m of meds) lines.push(`  ${m[0]} ${m[1]}, ${m[2]}`);
  } else {
    // boarding
    lines.push("BOARDING INTAKE");
    lines.push(`Pet: Pet${i}  ${species}  Breed: ${breed}  Weight: ${weightShown}`);
    lines.push(`Microchip: ${chip}`);
    lines.push("Required vaccinations (current):");
    for (const v of vaccines) lines.push(`${v} - given ${given.shown}, expires ${due.shown}`);
    lines.push("Current medications:");
    for (const m of meds) lines.push(`${m[0]} ${m[1]} - ${m[2]}`);
  }

  return { lines, label };
}

async function renderPdf(name, lines) {
  const d = new PDFDocument({ size: "LETTER", margin: 50 });
  const done = new Promise((res) => d.pipe(createWriteStream(join(OUT, name))).on("finish", res));
  d.font("Helvetica").fontSize(11);
  for (const l of lines) d.text(l).moveDown(0.2);
  d.end();
  return done;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function renderPng(name, lines) {
  // Clean black-on-white text image — best case for OCR.
  const H = 60 + lines.length * 34;
  const body = lines
    .map((l, i) => `<text x="40" y="${60 + i * 34}" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#111">${esc(l)}</text>`)
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${H}"><rect width="900" height="${H}" fill="#fff"/>${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, name));
}

const labels = {};
const jobs = [];
for (let i = 0; i < COUNT; i += 1) {
  const { lines, label } = buildDoc(i);
  const pdf = `doc${String(i).padStart(3, "0")}.pdf`;
  const png = `doc${String(i).padStart(3, "0")}.png`;
  labels[pdf] = label;
  labels[png] = label;
  jobs.push(renderPdf(pdf, lines), renderPng(png, lines));
}
await Promise.all(jobs);
writeFileSync(join(OUT, "bulk-labels.json"), JSON.stringify(labels, null, 2));
console.log(`generated ${COUNT} labelled docs (PDF + PNG) in fixtures/bulk/`);
