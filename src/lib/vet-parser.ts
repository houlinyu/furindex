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

// A line that names a specific vaccine/disease is a RECORD, not just a section
// heading — "Rabies vaccination" on a terse certificate is the vaccine itself.
// Consuming it as a heading erased the only vaccine mention and made the card
// read as illegible. (Duplicates are merged by canonical name downstream, so
// keeping a title like "RABIES VACCINATION CERTIFICATE" as data is harmless.)
const SPECIFIC_VACCINE =
  /\b(rabies|dhl?pp\w*|da2pp\w*|dapp|fvrcp\w*|bordetella|bordatella|felv|fiv|fip|lepto\w*|leptospir\w*|distemper|parvo\w*|parainfluenza|adenovirus|lyme|borrelia|influenza|giardia|coronavirus|panleukopenia|calicivirus|rhinotracheitis|nobivac|vanguard|purevax|recombitek|imrab|duramune)\b/i;

/** A short line with no value on it reads as a heading, not as data. */
function headingFor(text: string): Section | null {
  const t = text.trim();
  if (!t || t.length > 44) return null;
  const looksLikeHeading =
    (t === t.toUpperCase() && /[A-Z]{3}/.test(t)) ||
    /^[A-Z][a-z ]+:?$/.test(t) ||
    // Title Case, possibly multi-word with small connectives — "Certificate of
    // Vaccination", "Vaccination Record". Every word is either capitalised or a
    // connective, so a data line ("Rabies given 14 Aug 2026", with a lowercase
    // word) does not qualify. Exclude a phrase that STARTS with a data-label word
    // ("Patient Pepper", "Owner Jane") — that is a labelled value, not a heading.
    (/^[A-Z][A-Za-z]+(?:\s+(?:of|and|the|for|&|[A-Z][A-Za-z]+))+:?$/.test(t) &&
      !/^(patient|owner|pet|animal|name|species|breed|sex|colou?r|dob|microchip|chip|weight|clinic|hospital|doctor|client|address|phone|tel|email|lot|batch)\b/i.test(t));
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
      // A heading that also NAMES a specific vaccine ("RABIES VACCINATION",
      // "Rabies vaccination") is the vaccine record itself — advance the section
      // (so the lines that follow are grouped as vaccinations, not left polluting
      // the previous free-text section) but KEEP the line as data so the vaccine
      // is not lost. A pure title ("Certificate of Vaccination") is consumed.
      if (!SPECIFIC_VACCINE.test(cleaned)) continue;
    }
    out.push({ raw, text: cleaned, section });
  }
  return out;
}

// ------------------------------------------------------------------- utilities

// Trailing (?![\d/\-]) so a date whose month abuts a currency symbol ("Balance
// due $12/25/2026") is not read as a $12 charge: every truncation of the amount
// is followed by a digit or a date separator, so the match fails cleanly.
const MONEY_RE = /([$£€]|\bUSD\b|\bGBP\b|\bEUR\b)\s*(\d[\d.,]*\d|\d)(?![\d/\-])/i;

/**
 * Parse a printed money amount in either convention: US/UK "1,234.56" (comma
 * thousands, dot decimal) or continental European "1.234,56" / "3,50" (dot
 * thousands, comma decimal). The last separator is the decimal one, unless it is
 * a comma followed by exactly three digits with no dot present (thousands).
 */
function parseMoney(raw: string): number {
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  let s: string;
  if (lastComma > lastDot) {
    const afterComma = raw.length - lastComma - 1;
    if (afterComma === 3 && lastDot < 0) s = raw.replace(/,/g, ""); // "1,234" thousands
    else s = raw.replace(/\./g, "").replace(",", "."); // comma is the decimal
  } else {
    s = raw.replace(/,/g, ""); // dot decimal (or none), comma thousands
  }
  return Number(s);
}

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
  let lines = toLines(text).filter((l) => !CONTACT_LINE.test(l.text));

  // Multi-pet guard: a document describing two or more animals must NOT be
  // flattened into one record that keeps pet A's name but back-fills pet B's
  // chip, weight or vaccines. When a second, differently-named patient block
  // begins, keep only the first animal's block so nothing cross-wires, and say
  // so. (A single pet whose name is merely repeated in a header/footer has one
  // distinct name and is untouched.)
  const PATIENT_MARKER = /^\s*(?:patient|pet|animal)(?:\s+name)?\s*[:#]\s*(.+)$/i;
  const markers: Array<{ i: number; tokens: string[] }> = [];
  lines.forEach((l, i) => {
    const mk = PATIENT_MARKER.exec(l.text);
    if (mk) {
      const tokens = (cleanName(mk[1]) ?? "").toLowerCase().split(/[\s-]+/).filter(Boolean);
      if (tokens.length) markers.push({ i, tokens });
    }
  });
  // Two labels are the SAME animal when one name is a token-prefix of the other:
  // "Bella" / "Bella Smith" is one pet labelled two ways. Two labels are DIFFERENT
  // animals when they share a first name but diverge later: "Bella Smith" (dog) vs
  // "Bella Jones" (cat). Group the markers by that rule and, if more than one
  // group appears, keep only the first animal's block so nothing cross-wires.
  const samePet = (a: string[], b: string[]) => {
    const n = Math.min(a.length, b.length);
    for (let k = 0; k < n; k++) if (a[k] !== b[k]) return false;
    return true;
  };
  const groups: string[][] = [];
  const secondPetAt: number[] = [];
  for (const m of markers) {
    if (groups.some((g) => samePet(g, m.tokens))) continue;
    groups.push(m.tokens);
    if (groups.length >= 2) secondPetAt.push(m.i);
  }
  if (groups.length >= 2) {
    lines = lines.slice(0, secondPetAt[0]);
    caveats.push(
      `this document appears to list more than one animal (${groups
        .slice(0, 3)
        .map((g) => g.join(" "))
        .join(", ")}) — only the first is shown, to avoid mixing their records`,
    );
  }

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
  // Too few words to be a document AND no real veterinary signal — then there
  // is nothing to parse. A terse but clearly-veterinary card (a rabies
  // certificate: "Rabies vaccination Administered <date> Lot <n> Next due
  // <date>") clears vetScore >= 3 and must NOT be refused just for being short.
  const tooFewWords = body.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w)).length < 8;

  const scanTooPoor = ocr && opts.ocrConfidence != null && opts.ocrConfidence < 45;
  if (garbage > 0.4 || (tooFewWords && vetScore < 3) || scanTooPoor) {
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
  // Short is not the same as garbage: a real rabies certificate is only a
  // dozen tokens. Judge the actual noise ratio and let the sparse/vet-signal
  // gates decide whether there is enough to parse — don't declare every terse
  // document illegible.
  if (words.length === 0) return 1;
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
  let v = tidy(s).replace(/\s*\(.*$/, "").split(/\s{2,}/)[0];
  v = v.split(/[,;|]/)[0].trim();
  v = v.split(/\s+[-–—]\s+/)[0].trim(); // "Rex - Labrador Retriever" -> "Rex"
  // A two-column PDF gets flattened to one space-joined line, gluing the next
  // field onto the name ("Bella Rabies 05/10/2026", "Max Species: Dog"). A pet
  // name never contains a second field label, a vaccine word, or a number — cut
  // at the first of those so the neighbouring column can't become the name.
  v = v.replace(
    /\s+(?:species|breed|sex|colou?r|micro-?chip|chip|weight|wt|bw|dob|d\.?o\.?b|age|neutered|spayed|intact|owner|client|vaccin\w*|rabies|dhl?pp\w*|da2pp\w*|fvrcp\w*|bordetella|felv|fiv|fip|lepto\w*|distemper|parvo\w*|lyme|nobivac|lot|batch)\b.*$/i,
    "",
  );
  v = v.replace(/\s+[A-Za-z][A-Za-z.]*\s*[:#].*$/, ""); // any glued "Label:" field
  // Cut a glued DATE or long id ("Bella 05/10/2026", "Bella 985141002317744"),
  // but NOT a short number that is part of the name ("Lucky 7", "Apollo 13").
  v = v.replace(/\s+(?:\d{4,}|\d{1,3}[/.\-]\d).*$/, "").trim();
  if (!v || v.length > 40 || !/[A-Za-z]/.test(v)) return null;
  return v;
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
    // "Patient: Rex" — the token before the colon is a field LABEL, not the pet's
    // name; the labelled extractor handles it. Don't record "Patient" as a name.
    if (/^(patient|owner|pet|animal|name|species|breed|sex|colou?r|weight|microchip|chip|dob|date|client|clinic|hospital|doctor|vet|dr|address|phone|tel|email|reg|lot)$/i.test(m[1]))
      continue;
    const rest = m[2];
    // If the line states the species outright, trust it — an ambiguous breed word
    // ("Rex" is a rabbit/cat breed but far more often a dog's name) must not
    // override an explicit "Dog"/"Canine".
    const explicit: Species | null = /\b(dog|canine|puppy|bitch)\b/i.test(rest)
      ? "dog"
      : /\b(cat|feline|kitten)\b/i.test(rest)
        ? "cat"
        : null;
    for (const [breedName, sp] of SPECIES_OF_BREED) {
      const re = new RegExp(`\\b${breedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      const bm = re.exec(rest);
      if (bm) {
        if (explicit && sp !== explicit) continue;
        return { name: m[1], breed: tidy(bm[0]), species: explicit ?? sp };
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
  const raw = s.trim();
  const firstDigit = raw.search(/[0-9]/);
  // Everything printed before the first digit is context for that number.
  const pre = firstDigit >= 0 ? raw.slice(0, firstDigit) : raw;
  // "none" / "N/A" / "not chipped" means there is no chip — never scavenge a
  // stray number (a phone, an account) from the rest of the line.
  if (/\b(none|n\/?a|n\.a\.?|not\s+chipped|un-?chipped|no\s+chip|pending|unknown)\b/i.test(pre)) return null;
  // A number that belongs to a DIFFERENT labelled field is not the chip. On a
  // blank "Microchip:" line the value can bleed in from a neighbouring field
  // ("License No 123...", "mobile 555...", "Lot ABC..."); reject when a non-chip
  // label sits just before the number.
  if (/\b(phone|mobile|cell|tel|fax|account|acct|licen[sc]e|lic|policy|insurance|invoice|receipt|order|reg(?:istration|ister)?|ref(?:erence)?|claim|auth(?:orization)?|dea|npi|rx|po|lot|batch|serial|dob|d\.o\.b|birth|amount|total|balance|weight)\b[^0-9]{0,12}$/i.test(pre)) return null;
  // A phone number (3-3-4 grouping, or a parenthesised area code) reads as 10
  // digits once separators are stripped — the same length as a legacy chip — so
  // reject the phone SHAPE before it can be surfaced as a microchip.
  if (/(?:^|\D)\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}(?:\D|$)/.test(raw)) return null;
  // Real pet microchips are all DIGITS: 15 (ISO 11784/11785) or 9-10 (legacy
  // AVID/FECAVA). The alphanumeric fallback was dropped: it surfaced DEA numbers,
  // licence ids and even the label word "microchip" as the chip. A non-digit read
  // is OCR corruption or a different field — leave it blank for a human.
  const m = /\b([0-9]{9,16})\b/.exec(raw.replace(/[\s.\-]/g, ""));
  if (!m) return null;
  const v = m[1];
  // 11-14 or 16 digits is an OCR digit drop/add — not a real chip.
  if (v.length !== 15 && v.length !== 9 && v.length !== 10) return null;
  // A run of one repeated digit ("000000000000000") is a placeholder, not a chip.
  if (/^(\d)\1+$/.test(v)) return null;
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

const OZ_TO_KG = 0.028349523125;
const WEIGHT_LABEL = /^(current\s+)?(body\s*)?(weight|wt\.?|bw|mass)\b/i;
// Not the animal's current body weight: a birth/previous/target weight, or a
// per-kilogram DOSING weight ("weight-based dose 2 mg/kg").
const WEIGHT_SKIP = /\b(birth|born|previous|prior|last\s+visit|estimated|target|ideal|goal|dosing|dose|per\s*kg)\b/i;

/**
 * Convert a value in a recognised unit to kilograms; null if the unit isn't one.
 * Units are matched EXACTLY (not by prefix): a prefix match read "88 bpm" and
 * "24 (BUN)" as pounds because they start with 'b'. OCR spellings of "lb" are
 * already folded to "lb" by the caller, so only the true unit words remain.
 */
function unitToKg(n: number, u: string): number | null {
  if (u.includes("/")) return null; // "mg/kg", "ml/kg" — a rate/dose, not a weight
  if (/^k/.test(u)) return n; // kg, kgs, kilo(s), kilogram(s)
  if (/^(lb|lbs|pound|pounds)$/.test(u)) return n * LB_TO_KG;
  if (/^(oz|ounce|ounces)$/.test(u)) return n * OZ_TO_KG;
  if (/^(g|gs|gm|gms|gram|grams|gramme|grammes)$/.test(u)) return n * 0.001;
  return null;
}

function parseWeightValue(value: string, caveats: string[]): number | null {
  // A letter glued to the front of the number ("S2.4", "lO.4", "l0.4") is a
  // glyph-corrupted digit; reading the surviving digits would surface a wrong
  // body weight, so reject the value rather than guess. But a real measurement
  // qualifier glued on ("ca.4.2 kg", "approx.4.2 kg", "est.4.2") is fine — the
  // weight is genuine, just prefixed.
  const fd = value.search(/[0-9]/);
  if (fd > 0) {
    const prefix = value.slice(0, fd);
    const isQualifier = /(?:approx(?:imately)?|ca|circa|est|estimated|about|c)\.?\s*$/i.test(prefix);
    if (!isQualifier && /[A-Za-z][.,]?$/.test(prefix)) {
      caveats.push(`a weight of "${tidy(value)}" looks OCR-corrupted — left blank`);
      return null;
    }
  }
  // Capture the number (allowing a European comma decimal) and its unit token,
  // admitting the OCR noise glyphs that spell "lb" as "|b"/"1b"/"(b"/"ib".
  const m = /(\d+(?:[.,]\d+)?)\s*([A-Za-z(|1!\[\]{}\\/]+)?/.exec(value);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  // Fold a leading OCR noise glyph to 'l' so "|b"/"1b"/"(b"/"ib" all read "lb".
  const unitNorm = (m[2] ?? "").toLowerCase().replace(/^[|1!\[\]{}()\\/i]/, "l");
  const kg = unitToKg(n, unitNorm);
  if (kg == null) {
    caveats.push(`a weight of "${tidy(value)}" had no readable unit — left blank`);
    return null;
  }
  const rounded = Math.round(kg * 100) / 100;
  // Plausibility in kilograms: nothing lighter than ~20 g or heavier than the
  // largest breeds (~120 kg). 300 lb (136 kg) — a common OCR digit-duplication
  // of 30 lb — is caught here; an invented weight is worse than a missing one.
  if (rounded < 0.02 || rounded > 120) {
    caveats.push(`a weight of "${tidy(value)}" is not a plausible body weight — left blank`);
    return null;
  }
  return rounded;
}

function readWeight(lines: DocLine[], caveats: string[]): number | null {
  // Gather weight-labelled candidates, dropping non-current weights (birth,
  // previous, target) and per-kg dosing weights, and preferring a line that
  // explicitly says "current"/"today" so a birth weight never wins over it.
  const cands: { value: string; current: boolean }[] = [];
  for (const l of lines) {
    if (WEIGHT_SKIP.test(l.text)) continue;
    const hit = labelled([l], WEIGHT_LABEL);
    if (hit) cands.push({ value: hit.value, current: /\b(current|today|now)\b/i.test(l.text) });
  }
  const chosen = cands.find((c) => c.current)?.value ?? cands[0]?.value ?? inlineWeight(lines)?.value ?? null;
  if (chosen == null) return null;
  return parseWeightValue(chosen, caveats);
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
    if (!/total|balance|amount (due|owed|paid)|grand total|charg|paid|due/i.test(l.text)) continue;
    // A deposit / part-payment / refund line is not the grand total, and would
    // otherwise win the "largest amount" contest ("Deposit paid $200" beating
    // "Total due $120"). Exclude only genuine PARTIAL amounts — a bare "Amount
    // Paid $196" is still the total.
    if (/\b(deposit|down\s*payment|prepaid|tendered|change|refund|credit)\b/i.test(l.text)) continue;
    const m = MONEY_RE.exec(l.text);
    if (!m) continue;
    const symbol = m[1].toUpperCase();
    const currency = symbol === "$" ? "USD" : symbol === "£" ? "GBP" : symbol === "€" ? "EUR" : symbol;
    const amount = parseMoney(m[2]);
    if (!Number.isFinite(amount)) continue;
    const label = tidy(l.text.slice(0, m.index)) || "Total";
    // The grand total is the largest such figure on the document.
    if (!best || amount > best.amount) best = { amount, currency, label: label.slice(0, 40) };
  }
  return best;
}

// ---- vaccinations ----------------------------------------------------------

const LOT_RE = /\b(?:lot|batch|serial)\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{2,})/i;
// A bare "AAA-#####" token can be a lot number — but also an order, invoice,
// reference, DEA or claim number. Exclude those prefixes so they are not
// surfaced as a vaccine's lot when the real lot is absent.
const LOT_TOKEN_RE = /\b(?!(?:ord|inv|ref|po|clm|dea|npi|auth|acct|rx|no|id|lic|pol)-)([A-Za-z]{2,4}-\d{3,}|\d{4,}[A-Za-z]-\d{3,})\b/i;
const DUE_CUE = /\b(due|next|expir|renew|recheck|booster due|valid (to|until))\b/i;
const ADMIN_CUE_NEAR = /\b(given|administered|vaccinated|inoculated|received|done)\b/i;

/** Index of the LAST match of `re` in `s`, or -1 — for nearest-cue date typing. */
function lastIndexOfMatch(s: string, re: RegExp): number {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = g.exec(s))) {
    last = m.index;
    if (m.index === g.lastIndex) g.lastIndex++;
  }
  return last;
}

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
    // A recognised disease name on a line does NOT mean the vaccine was given.
    // Two tiers, because a REAL administration note often mentions a test word in
    // passing ("DHPP administered; no adverse reaction", "Rabies given, titer not
    // needed"):
    //  - HARD: phrases that state the vaccine was NOT given (declined, deferred,
    //    "due for", exemption, "elected to skip") — always skip.
    //  - SOFT: test/screen/context words (titer, 4DX, "tested negative", "no
    //    history of") — skip ONLY when the line carries no positive administration
    //    evidence. A clear "given/administered/vaccinated" (which HARD has already
    //    stripped of its negated forms) means a real dose, test word or not.
    if (
      /\b(deferred|declined|not\s+given|never\s+given|refused|postponed|due\s+but|due\s+for|overdue|past\s+due|not\s+due|exempt\w*|medical\s+exemption|elected\s+to\s+skip|opted?\s+out|owner\s+declined|to\s+be\s+given|will\s+be\s+given|scheduled)\b/i.test(
        l.text,
      )
    )
      continue;
    const positiveAdmin = /\b(given|administered|vaccinated|inoculated|boostered)\b/i.test(l.text);
    if (
      !positiveAdmin &&
      /\b(titer|titre|serolog\w*|antibod\w*|screen\w*|tested|test\s+(?:result|negative|positive|for)|negative|positive\s+for|no\s+history|history\s+of|4dx|snap\s+test)\b/i.test(
        l.text,
      )
    )
      continue;
    // "EUROPEAN PET PASSPORT - VACCINATION AGAINST RABIES" is a document title,
    // and "protects against distemper" describes what a vaccine is for — neither
    // is an administration. Skip an "against <disease>" line that carries no date
    // and no lot, so the passport's real vaccine (on its own labelled lines) is
    // the only entry and the single-vaccine date harvest below can run.
    if (/\bagainst\b/i.test(l.text) && dates.length === 0 && !LOT_RE.test(l.text)) continue;

    let administered: string | null = null;
    let due: string | null = null;
    for (const hit of dates) {
      // Classify each date by the NEAREST cue before it, not by any cue within a
      // fixed window — otherwise a reverse-order line ("next due <d1>, given
      // <d2>") lets the earlier "due" capture the given date. Whichever of an
      // administration cue or a due cue sits closer to the date wins.
      const before = l.text.slice(Math.max(0, hit.index - 22), hit.index);
      // A date labelled as a birth date is never a vaccine's administration or
      // due date. On a two-column PDF a left-column "D.O.B: 03/14/2019" can be
      // flattened onto a right-column vaccine row — using it would fabricate a
      // "vaccinated on the birthday" record. Skip a date cued by birth.
      if (/\b(d\.?o\.?b|date\s+of\s+birth|born|birth\s*date)\b\W{0,4}$/i.test(before)) continue;
      // A date attached to a TEST is a sample/draw date, not an administration.
      // The two-tier guard admits a line like "Rabies titer drawn <d1>; given
      // <d2>" because it has "given" — but the titer-draw date must not become
      // the administration. Skip a date cued by a test word.
      if (/\b(titer|titre|serolog\w*|drawn|sampled?|collected|screen\w*|tested|test)\b\W{0,6}$/i.test(before)) continue;
      const value = resolve(hit.parse(order));
      const dueIdx = lastIndexOfMatch(before, DUE_CUE);
      const adminIdx = lastIndexOfMatch(before, ADMIN_CUE_NEAR);
      if (dueIdx >= 0 && (adminIdx < 0 || dueIdx > adminIdx)) {
        due = due ?? value;
      } else if (adminIdx >= 0) {
        administered = administered ?? value;
      } else if (!administered) {
        administered = value;
      } else {
        due = due ?? value;
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
    const ADMIN_CUE = /\b(date\s+administered|date\s+of\s+vaccination|vaccinated|administered|given|inoculated)\b/i;
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
// "50 mg/ml", "5 mg/kg", "10 %" are a concentration or a per-kg rate, not the
// DELIVERED dose ("give 2 ml") — never surface a rate as the dose.
const DOSE_RATE = /\/\s*(?:ml|kg|lb|l|dose|tab\w*)\b|%/i;
// A food or prescription diet is not a medication, even when dispensed "1 sachet"
// or "2 cups". Brand/diet/serving cues that a drug direction never carries.
// NOTE: not the bare serving words "cup"/"scoop" — those match incidental drug
// instructions ("give with 1 cup of water"). A real prescription food is named by
// its brand/diet or a food unit (kibble, kcal, canned/dry/wet food).
const FOOD_RE =
  /\b(royal\s*canin|hill'?s|science\s+diet|prescription\s+diet|purina|pro\s*plan|iams|eukanuba|blue\s+buffalo|farmina|acana|orijen|kibble|canned\s+food|dry\s+food|wet\s+food|kcal|per\s+meal|at\s+meal)\b|\bdiet\b|\bfeed\b/i;
// A medication name is a product, not a sentence: reject injected instructions,
// SQL, or markup that landed on a dose-shaped line, and reject prose runs.
const MED_NAME_BAD =
  /\b(ignore|instructions?|previous|system|assistant|prompt|delete|select|insert|update|drop\s+table|password|script|function|console|null|undefined|approve)\b/i;
/** Route words that must not bleed into the captured frequency. */
const ROUTE_RE = /\s+(?:PO|SQ|SC|IM|IV|by\s+mouth|orally|topical(?:ly)?|per\s+os)\b.*$/i;

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
    // A food or prescription diet is not a medication, even dispensed by sachet
    // or cup — skip it wherever it appears.
    if (FOOD_RE.test(l.text)) continue;
    // A price is not part of the direction — strip it so it can't bleed into the
    // dose, the frequency or the name ("once daily $65.00" -> "once daily").
    const raw = l.raw.replace(/\s*([$£€]|\bUSD\b|\bGBP\b|\bEUR\b)\s*\d[\d.,]*/gi, "").trim();
    const strong = DOSE_STRONG.exec(raw);
    const count = DOSE_COUNT.exec(raw);
    const freq = FREQ_RES.map((re) => re.exec(raw)).find(Boolean) ?? null;
    if (!inMedSection && !(freq && (strong || count))) continue;
    if (!strong && !count && !freq) continue;
    // A vaccine is recorded by the vaccination extractor; never double-book it as
    // a medication, even when it carries a dose ("Rabies vaccine 1 ml SQ").
    if (findVaccineInLine(l.text, false)) continue;

    // Directions usually sit after a dash: "<name and strength> — <directions>",
    // but the dash may be followed by a lowercase word ("- every 30 days"), so
    // do not require an uppercase after it.
    const split = raw.search(/\s[—–]\s|\s-\s/);
    const left = split > 0 ? raw.slice(0, split) : raw;
    const right = split > 0 ? raw.slice(split) : "";

    // A mass or volume is what a dose is, wherever on the line it is printed:
    // "Apoquel 5.4 mg — give 1 tablet twice daily" doses 5.4 mg, not 1 tablet.
    // But a CONCENTRATION or per-kg RATE ("50 mg/ml", "5 mg/kg") is not the
    // delivered dose — skip it and take the real dose ("2 ml"). Counts
    // ("1 chewable") are the fallback. Verbatim either way — never rewritten.
    const firstDose = (s: string): string | null => {
      if (!s) return null;
      const re = new RegExp(DOSE_STRONG.source, "gi");
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) if (!DOSE_RATE.test(m[0])) return m[0];
      return null;
    };
    const hit = (re: RegExp, s: string) => (s ? re.exec(s)?.[0] ?? null : null);
    const dosage =
      firstDose(right) ?? firstDose(left) ?? hit(DOSE_COUNT, right) ?? hit(DOSE_COUNT, left);

    let name = tidy(left.replace(MED_NOISE, "").replace(/^[^A-Za-z0-9(]+/, ""));
    const strongAt = name.search(DOSE_STRONG);
    const countAt = name.search(DOSE_COUNT);
    const cut = [strongAt, countAt].filter((n) => n > 2).sort((a, b) => a - b)[0];
    if (cut !== undefined) name = tidy(name.slice(0, cut));
    name = name.replace(/[,:;*]+$/, "").replace(/^[*\s]+/, "").slice(0, 80);
    if (!name || name.length < 3 || !/[A-Za-z]{3}/.test(name)) continue;
    if (/^(total|subtotal|balance|exam|consult)/i.test(name)) continue;
    // A drug name is a product, not injected prose/SQL/markup or a long sentence.
    if (MED_NAME_BAD.test(name) || name.split(/\s+/).length > 6) continue;

    // Trim route/dispense-quantity/price contamination off the captured
    // frequency: "BID PO for 7 days" -> "BID", "BID x 30 tablets 65.00" -> "BID".
    let frequency = freq ? tidy(freq[0]) : null;
    if (frequency) {
      frequency = frequency
        .replace(ROUTE_RE, "")
        .replace(/\s+x?\s*\d+\s*(?:tablets?|tabs?|caps?|capsules?|chewables?|chews?|doses?|pills?)\b.*$/i, "")
        .replace(/\s+(?:qty|quantity)\b.*$/i, "")
        .replace(/\s+\$?\d[\d.,]*$/, "")
        .replace(/[.,;]+$/, "")
        .trim();
    }

    const startM = /\b(?:start(?:ing|ed)?|from|begin(?:ning)?)\b[^.\n]{0,20}?(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})/i.exec(l.text);
    const endM = /\b(?:until|through|end(?:ing|s)?|last dose)\b[^.\n]{0,20}?(\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4})/i.exec(l.text);

    if (out.some((m) => m.name === name)) continue;
    out.push({
      name,
      dosage: dosage ? dosage.trim() : null,
      frequency: frequency || null,
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
