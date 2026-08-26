/**
 * Text → ExtractedReport, with no model and no network.
 *
 * This is a rules parser. It is weaker than a vision model and the output is
 * shaped to say so: it fills a field only when the document labels it, it
 * never repairs a dosage, and it pushes `confidence` down (and `notes` up)
 * whenever it had to lean on anything. The review screen unticks everything at
 * low confidence, which is the correct default for OCR'd paper.
 *
 * Pure and synchronous — no I/O — so every fixture is a unit test.
 */
import type { ExtractedReport } from "./extraction";
import { BREEDS } from "./breeds";
import { detectDateOrder, findDates, type DateOrder, type ParsedDate } from "./vet-dates";
import { findVaccineInLine } from "./vet-vaccines";

export type TextSource = "pdf-text" | "ocr";

export interface ParseOptions {
  source: TextSource;
  /** Tesseract's mean word confidence, 0–100, when the text came from OCR. */
  ocrConfidence?: number | null;
}

export const LB_TO_KG = 0.45359237;

type Species = NonNullable<ExtractedReport["pet"]["species"]>;
type AdditionalField = ExtractedReport["additional_fields"][number];

// ---------------------------------------------------------------- text shaping

/** OCR loves to prefix a line with a stray rule character: "| Species Feline". */
function stripEdgeJunk(line: string): string {
  return line
    .replace(/^[\s|¦!\[\]{}<>·•*~_—–\-=+.,'"`^]{1,4}(?=\s*[A-Za-z0-9$£€])/u, "")
    .replace(/\s+$/, "");
}

export interface DocLine {
  /** Exactly as it came out of the PDF or OCR — used for verbatim capture. */
  raw: string;
  /** Edge junk removed. Used for matching. */
  text: string;
  section: Section;
}

type Section =
  | "header"
  | "patient"
  | "reason"
  | "diagnosis"
  | "vaccinations"
  | "medications"
  | "diagnostics"
  | "charges"
  | "notes";

const HEADINGS: Array<[RegExp, Section]> = [
  [/reason for (visit|exam)|presenting (complaint|problem)|chief complaint|history/i, "reason"],
  [/assessment|diagnos[ie]s|findings|impression/i, "diagnosis"],
  [/vaccinat|immuni[sz]|certificate of vaccination|inoculat/i, "vaccinations"],
  [/medicat|prescri|dispens|to go home|take[- ]home|treatment|rx\b/i, "medications"],
  [/diagnostic|laborator|lab results?|bloodwork|test results?|vitals/i, "diagnostics"],
  [/charges|invoice|services rendered|itemi[sz]ed|account|payment|balance/i, "charges"],
  [/^notes\b|instructions|recommendations|^plan\b|follow[- ]?up|home care/i, "notes"],
  [/patient|animal details|pet details|signalment/i, "patient"],
];

/** A short line with no value on it reads as a heading, not as data. */
function headingFor(text: string): Section | null {
  const t = text.trim();
  if (!t || t.length > 44) return null;
  const looksLikeHeading =
    (t === t.toUpperCase() && /[A-Z]{3}/.test(t)) || /^[A-Z][a-z ]+:?$/.test(t);
  if (!looksLikeHeading) return null;
  // "Weight: 20.7 lb" is upper-case-free enough not to reach here, but a
  // labelled line with a value is data whatever its case.
  if (/:\s*\S/.test(t)) return null;
  for (const [re, section] of HEADINGS) if (re.test(t)) return section;
  return null;
}

export function toLines(text: string): DocLine[] {
  const out: DocLine[] = [];
  let section: Section = "header";
  for (const rawLine of text.split(/\r?\n/)) {
    const raw = rawLine.replace(/ /g, " ").replace(/\s+$/, "");
    if (!raw.trim()) continue;
    const cleaned = stripEdgeJunk(raw).trim();
    if (!cleaned) continue;
    const h = headingFor(cleaned);
    if (h) {
      section = h;
      continue;
    }
    out.push({ raw, text: cleaned, section });
  }
  return out;
}

// ------------------------------------------------------------------- utilities

const MONEY_RE = /([$£€]|\bUSD\b|\bGBP\b|\bEUR\b)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/i;

function labelled(lines: DocLine[], label: RegExp): { line: DocLine; value: string } | null {
  for (let i = 0; i < lines.length; i++) {
    // OCR turns a table's vertical rule into a stray letter: "i Sex Female".
    // Try the line as-is first, then with one such letter removed.
    const t0 = lines[i].text;
    const candidates = [t0, t0.replace(/^[iIl|!¦tLJ]{1,2}[\s.]+/, "")];
    const t = candidates.find((c) => label.test(c));
    if (t === undefined) continue;
    const m = label.exec(t);
    if (!m) continue;
    let rest = t.slice(m.index + m[0].length).replace(/^\s*[:.\-–—]\s*/, "").trim();
    // "Date of Birth:" alone on its line — the value is the next line.
    if (!rest && i + 1 < lines.length) rest = lines[i + 1].text.trim();
    if (!rest) continue;
    return { line: lines[i], value: rest };
  }
  return null;
}

/** Owner contact details are deliberately not transcribed. */
const CONTACT_LINE = /^\s*(client|owner|address|phone|tel|mobile|e-?mail|billed to|account holder)\b/i;

// ------------------------------------------------------------------ the parser

export interface ParseTrace {
  /** Human-readable reasons the parser is not fully sure of itself. */
  caveats: string[];
  dateOrder: DateOrder;
  vetScore: number;
  usedInference: boolean;
}

export function parseVetReport(
  rawText: string,
  opts: ParseOptions
): { report: ExtractedReport; trace: ParseTrace } {
  const caveats: string[] = [];
  const text = rawText.replace(/ /g, " ");
  const lines = toLines(text).filter((l) => !CONTACT_LINE.test(l.text));
  const body = lines.map((l) => l.text).join("\n");
  const order = detectDateOrder(body);
  const ocr = opts.source === "ocr";

  const empty = (): ExtractedReport => ({
    pet: { name: null, species: null, breed: null, sex: null, birth_date: null, microchip_id: null },
    clinic_name: null,
    visit_date: null,
    reason: null,
    diagnosis: null,
    cost_usd: null,
    weight_kg: null,
    vaccinations: [],
    medications: [],
    notes: null,
    additional_fields: [],
    confidence: "low",
    unreadable: true,
  });

  // --- is this even a vet document, and is it legible ----------------------
  const vetScore = scoreVetDocument(body);
  const garbage = garbageRatio(body);
  // Even a terse vaccination card carries a couple of dozen words. Under
  // eight and there is nothing to parse, whatever the file claims to be.
  const tooFewWords = body.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length < 8;

  const scanTooPoor = ocr && opts.ocrConfidence != null && opts.ocrConfidence < 45;
  if (garbage > 0.4 || tooFewWords || scanTooPoor) {
    const r = empty();
    r.notes = ocr
      ? "Read on this device without a model. Almost nothing legible came out of the image — a flatter, better-lit photo, or a PDF from the clinic, would read far better."
      : "Read on this device without a model. This file carried almost no readable text.";
    return { report: r, trace: { caveats: ["illegible"], dateOrder: order, vetScore, usedInference: false } };
  }
  if (vetScore < 3) {
    const r = empty();
    r.notes =
      "Read on this device without a model. Nothing in this document looks veterinary — no patient details, vaccines, clinic name or medication directions were found.";
    return { report: r, trace: { caveats: ["not a vet document"], dateOrder: order, vetScore, usedInference: false } };
  }

  let usedInference = false;
  let sawAmbiguous = false;
  const resolve = (d: ParsedDate | null): string | null => {
    if (!d) return null;
    if (d.ambiguous) {
      sawAmbiguous = true;
      caveats.push(`the date "${d.raw}" could be day/month or month/day — left blank`);
      return null;
    }
    if (d.inferred) usedInference = true;
    return d.iso;
  };
  const firstDate = (s: string): ParsedDate | null => {
    const hits = findDates(s);
    return hits.length ? hits[0].parse(order) : null;
  };

  // --- clinic --------------------------------------------------------------
  const clinic = findClinic(lines);

  // --- patient -------------------------------------------------------------
  const nameHit = labelled(lines, /^(patient name|patient|pet name|animal name|name of (pet|animal)|name)\b/i);
  let petName = nameHit ? cleanName(nameHit.value) : null;

  const breedHit = labelled(lines, /^(breed|breed\/type|type)\b/i);
  let breed = breedHit ? tidy(breedHit.value) : null;
  let speciesFromBreed: Species | null = breed ? speciesForBreed(breed) : null;

  // A handwritten note has no labels at all: "Sunny - Golden Retriever, MN".
  if (!petName || !breed) {
    const informal = findInformalSignalment(lines);
    if (informal) {
      petName = petName ?? informal.name;
      breed = breed ?? informal.breed;
      speciesFromBreed = speciesFromBreed ?? informal.species;
      if (informal.name || informal.breed) {
        caveats.push("the patient line was not labelled — the name and breed were read from a free-text line");
      }
    }
  }

  const speciesHit = labelled(lines, /^(species|animal type|patient type)\b/i);
  const species = (speciesHit ? speciesFromWord(speciesHit.value) : null) ?? speciesFromBreed;

  const sexHit = labelled(lines, /^(sex|gender)\b/i);
  const sex = sexFromText(sexHit ? sexHit.value : findInformalSex(lines));

  const dobHit = labelled(lines, /^(date of birth|d\.?o\.?b\.?|birth ?date|born)\b/i);
  const birthDate = dobHit ? resolve(firstDate(dobHit.value)) : null;

  const chipHit = labelled(lines, /^(microchip|micro-?chip( ?(id|no\.?|number))?|chip( ?(id|no\.?|number))?|transponder)\b/i);
  // Fall back to a MID-line chip: many records print it inline, e.g.
  // "Patient: Rex  Dog  Microchip: 985...". The label-at-start rule above only
  // catches it on its own line, which lost half of them at scale. A 9-16 digit
  // run right after a chip/transponder keyword is unambiguous.
  // Accept the real-world synonyms a clinic actually prints mid-line: "Chip ID",
  // "Chip No.", "Microchip #:", "Transponder (microchip):". A bare "chip"
  // immediately followed by a long digit run is unambiguous in a pet record, and
  // the separator may be any run of space/colon/hash/dot/dash.
  const MIDLINE_CHIP =
    /\b(?:micro-?chip|transponder|chip)\b(?:\s*\((?:microchip)\))?\s*(?:id|no\.?|number)?[\s:.#\-]*([0-9](?:[0-9\s-]{7,20})[0-9])/i;
  let microchip = chipHit ? readChip(chipHit.value) : null;
  if (!microchip) {
    for (const l of lines) {
      const m = MIDLINE_CHIP.exec(l.text);
      if (m) { microchip = readChip(m[1]); if (microchip) break; }
    }
  }

  // --- visit date ----------------------------------------------------------
  // The bare "Date" alternative must not swallow "Date of Birth", which on
  // most cards is printed several lines above the visit date.
  const visitHit = labelled(
    lines,
    /^(?!date of birth\b)(date of (service|visit|exam|examination|attendance)|visit date|service date|exam(ination)? date|date seen|seen on|consultation date|date)\b/i
  );
  let visitDate = visitHit ? resolve(firstDate(visitHit.value)) : null;
  let visitDateInferred = false;
  if (!visitDate) {
    // A dated note with no label. Only usable when the document offers exactly
    // one candidate that is not a birth date and not a "due" date.
    const loose = looseVisitDate(lines, order, dobHit?.value ?? null);
    if (loose) {
      visitDate = resolve(loose);
      if (visitDate) {
        visitDateInferred = true;
        caveats.push(`no line says "date of visit" — ${loose.raw} was the only date that could be one`);
      }
    }
  }

  // --- weight --------------------------------------------------------------
  const weight = readWeight(lines, caveats);

  // --- free text -----------------------------------------------------------
  const reason = sectionText(lines, "reason") ?? labelled(lines, /^(reason|presenting complaint|complaint)\b/i)?.value ?? null;
  const diagnosis = sectionText(lines, "diagnosis") ?? labelled(lines, /^(diagnosis|assessment|dx)\b/i)?.value ?? null;
  const docNotes = sectionText(lines, "notes");

  // --- money ---------------------------------------------------------------
  const additional: AdditionalField[] = [];
  const cost = readTotal(lines);
  let costUsd: number | null = null;
  if (cost) {
    if (cost.currency === "USD") costUsd = cost.amount;
    else {
      // Converting would mean inventing an exchange rate. Keep it as printed.
      additional.push({
        label: cost.label,
        value: cost.amount.toFixed(2),
        unit: cost.currency,
        value_type: "number",
        recorded_on: visitDate,
      });
      caveats.push(`the total is in ${cost.currency}, not dollars — it is kept as a separate field rather than converted`);
    }
  }

  // --- vaccinations --------------------------------------------------------
  const { vaccinations, fuzzyNames } = readVaccinations(lines, order, resolve, visitDate, ocr);
  if (fuzzyNames.length) {
    caveats.push(
      `vaccine ${fuzzyNames.length === 1 ? "name" : "names"} ${fuzzyNames
        .map((f) => `"${f.matchedText}" read as ${f.canonical}`)
        .join("; ")}`
    );
  }

  // --- medications ---------------------------------------------------------
  const medications = readMedications(lines, order, resolve);

  // --- other measurements --------------------------------------------------
  additional.push(...readMeasurements(lines, visitDate));

  // --- confidence ----------------------------------------------------------
  let confidence: ExtractedReport["confidence"] = opts.source === "pdf-text" ? "high" : "medium";
  const ocrConf = opts.ocrConfidence ?? null;

  if (caveats.length) confidence = down(confidence);
  if (visitDateInferred) confidence = down(confidence);
  // The visit date anchors every record on the page. If it was a 03/04/2026
  // that nothing in the document could disambiguate, the whole report is a
  // guess about when it happened — which is exactly what "low" is for.
  if (sawAmbiguous && !visitDate) confidence = "low";
  if (usedInference && !visitHit) confidence = down(confidence);
  if (ocr) {
    if (ocrConf != null && ocrConf < 70) {
      confidence = "low";
      caveats.push(`the scan read back at ${ocrConf.toFixed(0)}% character confidence`);
    }
    // A dose read off a photograph is the one value that must never be
    // accepted without a look at the paper, so the whole report drops to low
    // and the review screen ticks nothing.
    if (medications.some((m) => m.dosage)) {
      confidence = "low";
      caveats.push("a dosage was read from a scan — check it against the original before saving");
    }
  }
  const found =
    (petName ? 1 : 0) + (visitDate ? 1 : 0) + (clinic ? 1 : 0) + vaccinations.length + medications.length;
  if (found < 2) confidence = "low";

  const notes = buildNotes(docNotes, opts.source, caveats);

  return {
    report: {
      pet: { name: petName, species, breed, sex, birth_date: birthDate, microchip_id: microchip },
      clinic_name: clinic,
      visit_date: visitDate,
      reason: reason ? tidy(reason) : null,
      diagnosis: diagnosis ? tidy(diagnosis) : null,
      cost_usd: costUsd,
      weight_kg: weight,
      vaccinations,
      medications,
      notes,
      additional_fields: additional,
      confidence,
      unreadable: false,
    },
    trace: { caveats, dateOrder: order, vetScore, usedInference },
  };
}

function down(c: ExtractedReport["confidence"]): ExtractedReport["confidence"] {
  return c === "high" ? "medium" : "low";
}

function buildNotes(docNotes: string | null, source: TextSource, caveats: string[]): string | null {
  const how =
    source === "pdf-text"
      ? "Read on this device from the PDF's own text layer — no model, no upload to anyone."
      : "Read on this device by OCR — no model, no upload to anyone. OCR misreads digits; check anything numeric.";
  const parts = [docNotes?.trim(), how];
  if (caveats.length) parts.push(`Worth checking: ${caveats.join("; ")}.`);
  const out = parts.filter(Boolean).join("\n\n");
  return out || null;
}

// ------------------------------------------------------------- sub-extractors

/**
 * Weighted evidence that this is a veterinary document. Two points for things
 * only a vet document says; one for things a dentist's invoice also says. The
 * threshold is 3, so no single generic signal can let a non-vet document
 * through, and a sparse-but-real report (letterhead + patient + date) passes.
 */
const VET_SIGNALS: Array<[RegExp, number]> = [
  [/\bveterinar|\bvet\b|animal hospital|animal clinic|pet (hospital|clinic)|vet(erinary)? (centre|center|surgery)/i, 2],
  [/\bDVM\b|\bVMD\b|\bMRCVS\b|\bRVT\b|\bBVSc\b|\bVN\b/i, 2],
  [/\bmicrochip\b|\btransponder\b/i, 2],
  [/\bvaccinat|\bimmuni[sz]|\bbooster\b/i, 2],
  [/\brabies\b|\bdhpp\b|\bda2pp\b|\bfvrcp\b|\bbordetella\b|\bfelv\b|\blepto|\bpanleukopenia\b|\bparvovirus\b|\bparainfluenza\b|\bdistemper\b/i, 2],
  [/\bcanine\b|\bfeline\b|\bspayed\b|\bneutered\b|\bkitten\b|\bpuppy\b/i, 2],
  [/\bheartworm\b|\bflea\b|\bdeworm|\bfecal\b|\bfaecal\b|\banal gland/i, 1],
  [/\blot\s*(no|number|#)|\bbatch\b/i, 1],
  [/\bBID\b|\bSID\b|\bTID\b|\bq\d+h\b|\bp\.o\./i, 1],
  [/\bbody condition\b|\bBCS\b|\bexam(ination)? fee\b|\bwellness exam/i, 1],
  [/\bpatient\b|\bpet name\b|\banimal name\b/i, 1],
  [/\bbreed\b|\bspecies\b/i, 1],
  [/date of (service|visit|attendance)|visit date|date seen/i, 1],
];

export function scoreVetDocument(text: string): number {
  return VET_SIGNALS.reduce((n, [re, w]) => n + (re.test(text) ? w : 0), 0);
}

/** Share of "words" that are not word-shaped — OCR noise looks like this. */
export function garbageRatio(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 10) return 1;
  const bad = words.filter((w) => {
    const letters = w.replace(/[^A-Za-z]/g, "");
    if (!letters) return !/^[\d$£€.,:/%#()+-]+$/.test(w);
    if (letters.length <= 2) return false;
    // A run of letters with no vowel, or heavy punctuation, is not a word.
    return !/[aeiouyAEIOUY]/.test(letters) || /[^A-Za-z0-9.,:;/()#$£€%&'"+\-—–]/.test(w);
  }).length;
  return bad / words.length;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[\s:.\-–—]+|[\s.:;,\-–—]+$/g, "").trim();
}

function cleanName(s: string): string | null {
  const v = tidy(s).replace(/\s*\(.*$/, "").split(/\s{2,}/)[0];
  const name = v.split(/[,;|]/)[0].trim();
  if (!name || name.length > 40 || !/[A-Za-z]/.test(name)) return null;
  return name;
}

function findClinic(lines: DocLine[]): string | null {
  const labelHit = labelled(lines, /^(clinic|hospital|practice|veterinary practice)\b/i);
  if (labelHit) return tidy(labelHit.value);
  // Otherwise the letterhead: the first line that names itself as veterinary.
  for (const l of lines.slice(0, 10)) {
    if (/(veterinar|animal hospital|animal clinic|vet clinic|vet centre|vet center|pet hospital|animal care|vet surgery|\bvet\b)/i.test(l.text)) {
      const t = tidy(l.text);
      if (t.length <= 70 && !/[$£€]/.test(t)) return t;
    }
  }
  return null;
}

const SPECIES_WORDS: Array<[RegExp, Species]> = [
  [/canine|\bdog\b|puppy|bitch/i, "dog"],
  [/feline|\bcat\b|kitten|queen\b/i, "cat"],
  [/avian|\bbird\b|parrot|budgie|cockatiel|parakeet/i, "bird"],
  [/rabbit|lagomorph|bunny/i, "rabbit"],
  [/reptile|lizard|snake|tortoise|turtle|gecko|bearded dragon/i, "reptile"],
  [/ferret|guinea pig|hamster|\brat\b|gerbil|chinchilla|mouse|degu/i, "small_mammal"],
];

function speciesFromWord(s: string): Species | null {
  for (const [re, sp] of SPECIES_WORDS) if (re.test(s)) return sp;
  return null;
}

const SPECIES_OF_BREED = (() => {
  const map = new Map<string, Species>();
  for (const [sp, list] of Object.entries(BREEDS)) {
    if (!["dog", "cat", "bird", "rabbit", "reptile", "small_mammal", "other"].includes(sp)) continue;
    for (const b of list) map.set(b.toLowerCase(), sp as Species);
  }
  return map;
})();

function speciesForBreed(breed: string): Species | null {
  const key = breed.toLowerCase().replace(/\s+/g, " ").trim();
  return SPECIES_OF_BREED.get(key) ?? null;
}

/** "Sunny - Golden Retriever, MN" — a chart note with no field labels. */
function findInformalSignalment(
  lines: DocLine[]
): { name: string | null; breed: string | null; species: Species | null } | null {
  for (const l of lines.slice(0, 12)) {
    const m = /^([A-Z][A-Za-z'’\-]{1,20})\s*[-–—~:]\s*(.+)$/.exec(l.text);
    if (!m) continue;
    const rest = m[2];
    for (const [breedName, sp] of SPECIES_OF_BREED) {
      const re = new RegExp(`\\b${breedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const bm = re.exec(rest);
      if (bm) {
        return { name: m[1], breed: tidy(bm[0]), species: sp };
      }
    }
  }
  return null;
}

function findInformalSex(lines: DocLine[]): string {
  for (const l of lines.slice(0, 12)) {
    if (/\b(MN|MC|CM|NM|FS|SF|SP|IM|IF)\b/.test(l.text)) return l.text;
  }
  return "";
}

function sexFromText(s: string): "male" | "female" | "unknown" | null {
  if (!s) return null;
  if (/\bfemale\b|\bspayed\b|\bspay\b|\b(FS|SF)\b|\bF\b(?!\w)/i.test(s)) return "female";
  if (/\bmale\b|\bneutered\b|\bcastrated\b|\b(MN|MC|CM|NM)\b|\bM\b(?!\w)/i.test(s)) return "male";
  if (/\bunknown\b/i.test(s)) return "unknown";
  return null;
}

function readChip(s: string): string | null {
  const m = /\b([0-9]{9,16})\b/.exec(s.replace(/[\s\-]/g, "")) ?? /\b([A-Z0-9]{9,16})\b/i.exec(s);
  if (!m) return null;
  const v = m[1];
  // Real microchips are 15 digits (ISO 11784/11785) or 9-10 (legacy AVID/FECAVA).
  // An all-digit read of 11-14 or 16 is almost always OCR dropping or adding a
  // digit in a long run — surfacing it would write a WRONG chip onto the record,
  // which is worse than none, so leave it blank for a human to confirm.
  if (/^[0-9]+$/.test(v) && !(v.length === 15 || v.length === 9 || v.length === 10)) return null;
  return v;
}

function looseVisitDate(lines: DocLine[], order: DateOrder, dobValue: string | null): ParsedDate | null {
  const seen = new Map<string, ParsedDate>();
  for (const l of lines) {
    if (/\b(due|next|expir|recheck|booster|renew|birth|d\.?o\.?b)\b/i.test(l.text)) continue;
    if (dobValue && l.text.includes(dobValue)) continue;
    for (const hit of findDates(l.text)) {
      const p = hit.parse(order);
      seen.set(p.raw, p);
    }
  }
  if (seen.size !== 1) return null;
  return [...seen.values()][0];
}

const WEIGHT_UNIT = /(kgs?|kilograms?|kilos?|lbs?|pounds?|Ibs?|1bs?|ibs?)\b|\(b\b/i;

function readWeight(lines: DocLine[], caveats: string[]): number | null {
  const hit = labelled(lines, /^(weight|body ?weight|wt\.?|bw)\b/i) ?? inlineWeight(lines);
  if (!hit) return null;
  // Capture the unit token even when OCR spells it with noise glyphs: it renders
  // "lb" as "|b", "1b", "ib" or "(b" (an 'l' becomes a pipe/one/paren), so the
  // class has to admit those before we can recognise pounds.
  const m = /(\d+(?:\.\d+)?)\s*([A-Za-z(|1!\[\]{}\\/]+)?/.exec(hit.value);
  if (!m) return null;
  const n = Number(m[1]);
  const unitRaw = (m[2] ?? "").toLowerCase();
  // Fold the leading OCR noise glyph to 'l' so "|b"/"1b"/"(b"/"ib" all read "lb".
  const unitNorm = unitRaw.replace(/^[|1!\[\]{}()\\/i]/, "l");
  let kg: number;
  if (/^k/.test(unitNorm)) kg = n;
  else if (WEIGHT_UNIT.test(unitNorm) || /^\(?[i1l]?b/.test(unitNorm)) kg = n * LB_TO_KG;
  else {
    caveats.push(`a weight of "${tidy(hit.value)}" had no readable unit — left blank`);
    return null;
  }
  const rounded = Math.round(kg * 100) / 100;
  if (rounded < 0.02 || rounded > 150) {
    // 831 lb is what OCR made of "9.3 lb" on one of the test cards. Dropping it
    // is right: an invented weight is worse than a missing one.
    caveats.push(`a weight of "${tidy(hit.value)}" is not a plausible body weight — left blank`);
    return null;
  }
  return rounded;
}

function inlineWeight(lines: DocLine[]): { line: DocLine; value: string } | null {
  for (const l of lines) {
    // The unit class admits OCR noise glyphs ("|b"/"1b"/"(b" for "lb"); readWeight
    // folds them back before converting.
    const m = /\b(?:wt|weight)\b[\s:.]*(\d+(?:[.,]\d+)?\s*[A-Za-z(|1!\[\]{}\\/]{1,3})/i.exec(l.text);
    if (m) return { line: l, value: m[1] };
  }
  return null;
}

function sectionText(lines: DocLine[], section: Section): string | null {
  const picked = lines.filter((l) => l.section === section && !/^[A-Z\s]{6,}$/.test(l.text));
  if (!picked.length) return null;
  const joined = picked.map((l) => l.text).join(" ").trim();
  return joined.length > 600 ? joined.slice(0, 600) : joined;
}

function readTotal(lines: DocLine[]): { amount: number; currency: string; label: string } | null {
  let best: { amount: number; currency: string; label: string } | null = null;
  for (const l of lines) {
    if (!/total|balance|amount (due|paid)|charg|paid|due/i.test(l.text)) continue;
    const m = MONEY_RE.exec(l.text);
    if (!m) continue;
    const symbol = m[1].toUpperCase();
    const currency = symbol === "$" ? "USD" : symbol === "£" ? "GBP" : symbol === "€" ? "EUR" : symbol;
    const amount = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;
    const label = tidy(l.text.slice(0, m.index)) || "Total";
    // The grand total is the largest such figure on the document.
    if (!best || amount > best.amount) best = { amount, currency, label: label.slice(0, 40) };
  }
  return best;
}

// ---- vaccinations ----------------------------------------------------------

const LOT_RE = /\b(?:lot|batch|serial)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,})/i;
const LOT_TOKEN_RE = /\b([A-Za-z]{2,4}-\d{3,}|\d{4,}[A-Za-z]-\d{3,})\b/;
const DUE_CUE = /\b(due|next|expir|renew|recheck|booster due|valid (to|until))\b/i;

function readVaccinations(
  lines: DocLine[],
  order: DateOrder,
  resolve: (d: ParsedDate | null) => string | null,
  visitDate: string | null,
  ocr: boolean
): { vaccinations: ExtractedReport["vaccinations"]; fuzzyNames: Array<{ matchedText: string; canonical: string }> } {
  const out: ExtractedReport["vaccinations"] = [];
  const fuzzyNames: Array<{ matchedText: string; canonical: string }> = [];

  for (const l of lines) {
    // A charge line that merely PRICES a vaccine ("Rabies vaccine  $32.00")
    // records nothing about giving it, and is skipped. But an itemised invoice
    // often documents the administration on the same line as the price —
    // "DHPP vaccination given 09/28/2026 lot X  $36.00" — and that IS a real
    // record. So a money line is only skipped when it lacks giving evidence.
    const isMoney = MONEY_RE.test(l.text);
    if (isMoney && !/\b(given|administered|vaccinated)\b/i.test(l.text)) continue;
    const dates = findDates(l.text);
    const hasEvidence =
      l.section === "vaccinations" ||
      dates.length > 0 ||
      LOT_RE.test(l.text) ||
      /\b(given|administered|booster|vaccin\w*|due)\b/i.test(l.text);
    if (!hasEvidence) continue;

    const match = findVaccineInLine(l.text, ocr);
    if (!match) continue;
    // "Leptospirosis booster deferred" — nothing was given.
    if (/\b(deferred|declined|not given|refused|postponed|due but)\b/i.test(l.text)) continue;
    // "EUROPEAN PET PASSPORT - VACCINATION AGAINST RABIES" is a document title,
    // and "protects against distemper" describes what a vaccine is for — neither
    // is an administration. Skip an "against <disease>" line that carries no date
    // and no lot, so the passport's real vaccine (on its own labelled lines) is
    // the only entry and the single-vaccine date harvest below can run.
    if (/\bagainst\b/i.test(l.text) && dates.length === 0 && !LOT_RE.test(l.text)) continue;

    let administered: string | null = null;
    let due: string | null = null;
    for (const hit of dates) {
      const before = l.text.slice(Math.max(0, hit.index - 26), hit.index);
      const isDue = DUE_CUE.test(before) || (dates.length > 1 && hit === dates[1] && !administered === false);
      const value = resolve(hit.parse(order));
      if (DUE_CUE.test(before)) {
        due = due ?? value;
      } else if (!administered) {
        administered = value;
      } else if (!due && isDue) {
        due = value;
      } else if (!due) {
        due = value;
      }
    }
    if (!administered && /\b(given|administered|vaccinated)\s+today\b/i.test(l.text) && visitDate) {
      administered = visitDate;
    }

    const lotM = LOT_RE.exec(l.text) ?? LOT_TOKEN_RE.exec(l.text);
    const lot = lotM ? lotM[1] : null;

    const existing = out.find((v) => v.name === match.canonical);
    if (existing) {
      existing.administered_on = existing.administered_on ?? administered;
      existing.due_on = existing.due_on ?? due;
      existing.lot_number = existing.lot_number ?? lot;
      continue;
    }
    out.push({ name: match.canonical, administered_on: administered, due_on: due, lot_number: lot });
    if (match.fuzzy) fuzzyNames.push({ matchedText: match.matchedText, canonical: match.canonical });
  }

  // Certificate / passport layout: one vaccine, its date and lot on their own
  // labelled lines ("Date Administered:", "Next Due:", "Valid until:", "Lot
  // No.:"). Those lines carry no vaccine name, so the per-line loop above never
  // attached them. With exactly one vaccine there is no ambiguity about which
  // vaccine they belong to, so harvest them now. Rabies certificates and EU pet
  // passports — the two documents an owner is most likely to actually have —
  // both take this shape.
  if (out.length === 1) {
    const v = out[0];
    const ADMIN_CUE = /\b(date\s+administered|date\s+of\s+vaccination|vaccinated\s+on|administered\s+on)\b/i;
    const DUE_CUE_LABEL = /\b(next\s+due|valid\s+(until|to)|expir\w*|booster\s+due|due\s+date)\b/i;
    // "Valid from" on a passport is the rabies-valid date, neither given nor due.
    const SKIP_DATE = /\b(date\s+of\s+birth|d\.?o\.?b|valid\s+from|lot\s+expir|expiration)\b/i;
    for (const l of lines) {
      // Look at the label immediately BEFORE each date, not the whole line — a
      // passport prints "Valid from: <d1>   Valid until: <d2>" on one line, and
      // only the date after "Valid until" is the due date.
      for (const hit of findDates(l.text)) {
        const before = l.text.slice(Math.max(0, hit.index - 24), hit.index);
        const value = resolve(hit.parse(order));
        if (!v.administered_on && ADMIN_CUE.test(before) && !SKIP_DATE.test(before)) {
          v.administered_on = value;
        } else if (!v.due_on && DUE_CUE_LABEL.test(before) && !SKIP_DATE.test(before)) {
          v.due_on = value;
        }
      }
      if (!v.lot_number) {
        const lm = LOT_RE.exec(l.text) ?? LOT_TOKEN_RE.exec(l.text);
        // Reject only the CAPTURE, not the whole line: "Lot No.: 549871  Lot
        // Expiration: 09/2027" must still yield 549871 (LOT_RE grabs it first),
        // while a standalone "Lot Expiration: 09/2027" must not read a date as a
        // lot number.
        if (lm && !/^expir/i.test(lm[1]) && !/^\d{1,2}[/.]\d{2,4}$/.test(lm[1])) {
          v.lot_number = lm[1];
        }
      }
    }
  }

  // A vaccine with a lot number was administered — a lot is only written down
  // for a dose that was actually given. If its own line carried no date (a
  // discharge note lists "Rabies - next due ... (lot X)" under a "Seen: <date>"
  // header), fall back to the visit date for the administration.
  if (visitDate) {
    for (const v of out) {
      if (!v.administered_on && v.lot_number) v.administered_on = visitDate;
    }
  }

  return { vaccinations: out, fuzzyNames };
}

// ---- medications -----------------------------------------------------------

/** Mass and volume first: that is what a dose is. */
const DOSE_STRONG = /\b\d+(?:[.,]\d+)?\s*(?:mcg|micrograms?|mg\/ml|mg\/kg|mg|grams?|g|ml|mls|mL|cc|iu|units?)\b/i;
/** Fallbacks: "1 tablet", "1 chewable", "1 dose" (unit-less preventives). */
const DOSE_COUNT = /\b\d+(?:\.\d+)?\s*(?:tablets?|tabs?|capsules?|caps?|chewables?|chews?|tubes?|drops?|sachets?|pumps?|sprays?|patch(?:es)?|doses?|applications?)\b/i;
const FREQ_RES: RegExp[] = [
  /\b(?:once|twice|thrice|three times|four times|\d+\s*times?)\s+(?:a\s+|per\s+|every\s+)?(?:daily|day|week|weekly|month|monthly|hour)\b[^.,;()]*/i,
  /\b(?:BID|SID|TID|QID|QD|EOD|PRN|q\.?\d+\s*h(?:rs?)?)\b[^.;()]*/i,
  /\bevery\s+\d+(?:-\d+)?\s*(?:hours?|hrs?|days?|weeks?|months?)\b[^.,;()]*/i,
  /\bevery other (?:day|week|month)\b[^.,;()]*/i,
  /\b(?:daily|weekly|monthly|nightly|morning and night)\b[^.,;()]*/i,
];
const MED_NOISE = /^(give|administer|dispense[d]?|apply|rx|prescribed|take|sig)\b[:.\s]*/i;

function readMedications(
  lines: DocLine[],
  order: DateOrder,
  resolve: (d: ParsedDate | null) => string | null
): ExtractedReport["medications"] {
  const out: ExtractedReport["medications"] = [];
  for (const l of lines) {
    // A price on the line does NOT disqualify a medication: an itemised invoice
    // prints the direction and the charge together — "Apoquel 5.4 mg - monthly
    // $65.00". The dose + frequency requirement and the name guards below are
    // what separate a real direction from a bare charge line, so the money test
    // is no longer a blanket skip.
    const inMedSection = l.section === "medications";
    // A price is not part of the direction — strip it so it can't bleed into the
    // dose, the frequency or the name ("once daily $65.00" -> "once daily").
    const raw = l.raw.replace(/\s*([$£€]|\bUSD\b|\bGBP\b|\bEUR\b)\s*\d[\d.,]*/gi, "").trim();
    const strong = DOSE_STRONG.exec(raw);
    const count = DOSE_COUNT.exec(raw);
    const freq = FREQ_RES.map((re) => re.exec(raw)).find(Boolean) ?? null;
    if (!inMedSection && !(freq && (strong || count))) continue;
    if (!strong && !count && !freq) continue;
    if (findVaccineInLine(l.text, false) && !strong && !count) continue;

    // Directions usually sit after a dash: "<name and strength> — <directions>",
    // but the dash may be followed by a lowercase word ("- every 30 days"), so
    // do not require an uppercase after it.
    const split = raw.search(/\s[—–]\s|\s-\s/);
    const left = split > 0 ? raw.slice(0, split) : raw;
    const right = split > 0 ? raw.slice(split) : "";

    // A mass or volume is what a dose is, wherever on the line it is printed:
    // "Apoquel 5.4 mg — give 1 tablet twice daily" doses 5.4 mg, not 1 tablet.
    // Counts ("1 chewable") are the fallback for products with no strength.
    // Verbatim either way — a dose is never rewritten, rounded or converted.
    const hit = (re: RegExp, s: string) => (s ? re.exec(s)?.[0] ?? null : null);
    const dosage =
      hit(DOSE_STRONG, right) ?? hit(DOSE_STRONG, left) ?? hit(DOSE_COUNT, right) ?? hit(DOSE_COUNT, left);

    let name = tidy(left.replace(MED_NOISE, ""));
    const strongAt = name.search(DOSE_STRONG);
    const countAt = name.search(DOSE_COUNT);
    const cut = [strongAt, countAt].filter((n) => n > 2).sort((a, b) => a - b)[0];
    if (cut !== undefined) name = tidy(name.slice(0, cut));
    name = name.replace(/[,:;]+$/, "").slice(0, 80);
    if (!name || name.length < 3 || !/[A-Za-z]{3}/.test(name)) continue;
    if (/^(total|subtotal|balance|exam|consult)/i.test(name)) continue;

    const startM = /\b(?:start(?:ing|ed)?|from|begin(?:ning)?)\b[^.\n]{0,20}?(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})/i.exec(l.text);
    const endM = /\b(?:until|through|end(?:ing|s)?|last dose)\b[^.\n]{0,20}?(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})/i.exec(l.text);

    if (out.some((m) => m.name === name)) continue;
    out.push({
      name,
      dosage: dosage ? dosage.trim() : null,
      frequency: freq ? tidy(freq[0]) : null,
      start_date: startM ? resolve(findDates(startM[1])[0]?.parse(order) ?? null) : null,
      end_date: endM ? resolve(findDates(endM[1])[0]?.parse(order) ?? null) : null,
    });
  }
  return out;
}

// ---- other measurements ----------------------------------------------------

const MEASURE_LABEL =
  /^(temperature|temp|heart rate|hr|pulse|respiratory rate|rr|body condition( score)?|bcs|muscle condition|dental grade|blood pressure|bp|glucose|bun|creatinine|alt|alp|ast|packed cell volume|pcv|hct|wbc|rbc|urine specific gravity|usg|fecal|faecal|heartworm[^:]*|felv[^:]*|fiv[^:]*|4dx|snap test|combo test|ear (cytology|swab)|skin scrape|blood test|urinalysis)\b/i;

function readMeasurements(lines: DocLine[], visitDate: string | null): AdditionalField[] {
  const out: AdditionalField[] = [];
  for (const l of lines) {
    const m = /^([^:]{2,48}):\s*(.+)$/.exec(l.text);
    if (!m) continue;
    const label = tidy(m[1]);
    const value = tidy(m[2]);
    if (!value || value.length > 60) continue;
    const inLab = l.section === "diagnostics";
    if (!inLab && !MEASURE_LABEL.test(label)) continue;
    if (/^(weight|body ?weight|microchip|species|breed|sex|name|patient|date|clinic|d\.?o\.?b)/i.test(label)) continue;
    if (MONEY_RE.test(value)) continue;

    // "5/9" is a score out of nine; "101.4 F" is a number with a unit.
    let v = value;
    let unit: string | null = null;
    let type: AdditionalField["value_type"] = "text";
    const scored = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/.exec(value);
    const numUnit = /^(-?\d+(?:\.\d+)?)\s*([%A-Za-z°/]{1,12})?$/.exec(value);
    if (scored) {
      v = scored[1];
      unit = `/${scored[2]}`;
      type = "number";
    } else if (numUnit) {
      v = numUnit[1];
      unit = numUnit[2] ? numUnit[2].replace(/^([FC])$/, "°$1") : null;
      type = "number";
    } else if (/^(positive|negative|yes|no|present|absent)$/i.test(value)) {
      type = "boolean";
    }
    if (out.some((f) => f.label.toLowerCase() === label.toLowerCase())) continue;
    out.push({ label: label.slice(0, 48), value: v, unit, value_type: type, recorded_on: visitDate });
  }
  return out;
}
