/**
 * Unit tests for the pure halves of the local extractor: date ambiguity,
 * vaccine naming, and the parser's refusal rules. No I/O, no fixtures.
 *
 *   npx tsx scripts/test-vet-parser.ts
 */
import { detectDateOrder, findDates, parseFirstDate } from "../src/lib/vet-dates";
import { findVaccineInLine } from "../src/lib/vet-vaccines";
import { parseVetReport, garbageRatio, scoreVetDocument, LB_TO_KG } from "../src/lib/vet-parser";

let failed = 0;
let passed = 0;

function eq(actual: unknown, expected: unknown, what: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed++;
    return;
  }
  failed++;
  console.log(`  FAIL  ${what}\n        expected ${b}\n        got      ${a}`);
}

// ---------------------------------------------------------------- dates
console.log("dates");
eq(detectDateOrder("Given 08/14/2026"), "mdy", "a second field over 12 fixes month/day/year");
eq(detectDateOrder("Given 14/08/2026"), "dmy", "a first field over 12 fixes day/month/year");
eq(detectDateOrder("03/04/2026"), "unknown", "nothing to go on stays unknown");
eq(detectDateOrder("14/08/2026 and 08/14/2026"), "unknown", "contradictory evidence stays unknown");

eq(parseFirstDate("03/04/2026", "unknown")?.iso, null, "an ambiguous date is never guessed");
eq(parseFirstDate("03/04/2026", "unknown")?.ambiguous, true, "and it says it was ambiguous");
eq(parseFirstDate("03/04/2026", "dmy")?.iso, "2026-04-03", "the document's own convention resolves it");
eq(parseFirstDate("03/04/2026", "dmy")?.inferred, true, "and that resolution is flagged as inferred");
eq(parseFirstDate("03/04/2026", "mdy")?.iso, "2026-03-04", "the other way round, likewise");
eq(parseFirstDate("August 14, 2026", "unknown")?.iso, "2026-08-14", "a spelled-out month needs no convention");
eq(parseFirstDate("14 August 2026", "unknown")?.iso, "2026-08-14", "day-first spelled out, too");
eq(parseFirstDate("2026-08-14", "unknown")?.iso, "2026-08-14", "ISO passes straight through");
eq(parseFirstDate("8/2/26", "mdy")?.iso, "2026-08-02", "a two-digit year under 70 is this century");
eq(parseFirstDate("8/2/94", "mdy")?.iso, "1994-08-02", "and over 69 is the last one");
eq(parseFirstDate("02/30/2026", "unknown"), null, "30 February is not a date in either order");
eq(findDates("no dates here").length, 0, "prose yields no dates");
eq(findDates("Rabies 08/14/2026 due 08/14/2029").length, 2, "both dates on a row are found");

// ---------------------------------------------------------------- vaccines
console.log("vaccines");
eq(findVaccineInLine("Rabies (3 year) 08/14/2026")?.canonical, "Rabies", "plain name");
eq(findVaccineInLine("DA2PP given today")?.canonical, "DHPP", "DA2PP is DHPP");
eq(findVaccineInLine("DHLPP booster")?.canonical, "DHPP", "so is DHLPP");
eq(findVaccineInLine("Feline RCP (FVRCP)")?.canonical, "FVRCP", "FVRCP through its long form");
eq(findVaccineInLine("FeLV 01/22/2026")?.canonical, "FeLV", "FeLV");
eq(findVaccineInLine("Lepto 4 booster")?.canonical, "Leptospirosis", "Lepto 4");
eq(findVaccineInLine("Bordetella (oral)")?.canonical, "Bordetella", "Bordetella");

eq(findVaccineInLine("tL FuRep 01/22/2026", true)?.canonical, "FVRCP", "OCR's FuRep is FVRCP");
eq(findVaccineInLine("tL FuRep 01/22/2026", true)?.fuzzy, true, "and it admits it guessed at the spelling");
eq(findVaccineInLine("Bordatelia {orl} 08/14/2026", true)?.canonical, "Bordetella", "OCR's Bordatelia");
eq(findVaccineInLine("tL FuRep 01/22/2026", false), null, "no fuzzy matching on clean text-layer text");
eq(findVaccineInLine("Rabbit hutch cleaning", true), null, "an ordinary word is not a vaccine");
eq(findVaccineInLine("Wood glue, 8 oz $8.49", true), null, "nor is a hardware line item");

// ---------------------------------------------------------------- refusals
console.log("refusals and invention");
const receipt = `Porter Square Hardware
Receipt # 44821
Teflon tape $2.49
LED bulb, 60W equivalent, 2-pack $12.98
TOTAL $47.32
Returns accepted within 30 days with receipt.`;
eq(parseVetReport(receipt, { source: "pdf-text" }).report.unreadable, true, "a hardware receipt is refused");
eq(parseVetReport(receipt, { source: "pdf-text" }).report.vaccinations, [], "and returns no records at all");

const noise = "aaa ### %%% ~~~ ,,,, |||| ^^^^ @@@@ ~~~~ ,,,, ;;;; |||| ]][[ %%%% $$$$";
eq(garbageRatio(noise) > 0.4, true, "noise reads as noise");
eq(scoreVetDocument("Rabies vaccine given, microchip 985141002317744, DVM") >= 3, true, "vet signals score");

const minimal = `Springfield Animal Hospital
Patient Name: Rex
Date of Service: March 2, 2026
Weight: 10 lb`;
const r = parseVetReport(minimal, { source: "pdf-text" }).report;
eq(r.medications, [], "no medication is invented when none is printed");
eq(r.vaccinations, [], "no vaccination is invented either");
eq(r.cost_usd, null, "no cost is invented");
eq(r.pet.birth_date, null, "no birth date is derived from anything");
eq(r.weight_kg, Math.round(10 * LB_TO_KG * 100) / 100, "10 lb converts to 4.54 kg");

const verbatim = `Riverside Veterinary Clinic
Patient Name: Tilly
Date of Service: 3 March 2026
MEDICATIONS
Prednisolone 0.50 mg — give 1 tablet by mouth every other day.`;
const v = parseVetReport(verbatim, { source: "pdf-text" }).report;
eq(v.medications[0]?.dosage, "0.50 mg", "a dosage is transcribed exactly as printed, trailing zero and all");
eq(v.medications[0]?.name, "Prednisolone", "with the product name kept separate");

const ambiguous = `Bristol Veterinary Centre
Patient Name: Biscuit
Species: Feline
Date of visit: 03/04/2026
Weight: 4.6 kg
Seen by Ms E. Okafor MRCVS`;
const a = parseVetReport(ambiguous, { source: "pdf-text" }).report;
eq(a.visit_date, null, "an unresolvable visit date is left blank");
eq(a.confidence, "low", "and the report says it is unsure");
eq(/could be day\/month or month\/day/.test(a.notes ?? ""), true, "and the note says why");

const heavy = `Brookline Animal Hospital
Patient Name: Pepper
Date of Service: January 22, 2026
Weight: 831 lb`;
eq(parseVetReport(heavy, { source: "ocr", ocrConfidence: 64 }).report.weight_kg, null, "an impossible weight is dropped, not stored");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
