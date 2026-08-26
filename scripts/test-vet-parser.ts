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
eq(parseFirstDate("14 Aug 2026", "unknown")?.iso, "2026-08-14", "an abbreviated month, day-first");
eq(parseFirstDate("Aug 14 2026", "unknown")?.iso, "2026-08-14", "an abbreviated month, month-first, comma-free");
eq(parseFirstDate("14-Aug-2026", "unknown")?.iso, "2026-08-14", "a hyphen-separated month, day-first (14-Aug-2026)");
eq(parseFirstDate("Aug-14-2026", "unknown")?.iso, "2026-08-14", "a hyphen-separated month, month-first (Aug-14-2026)");
eq(parseFirstDate("Sept. 3, 2026", "unknown")?.iso, "2026-09-03", "an abbreviated month with a trailing period");
eq(parseFirstDate("2026/08/14", "unknown")?.iso, "2026-08-14", "ISO order written with slashes (2026/08/14)");
eq(parseFirstDate("2026.08.14", "unknown")?.iso, "2026-08-14", "ISO order written with dots (2026.08.14)");
eq(parseFirstDate("14-Aug-2026", "unknown")?.ambiguous, false, "a spelled-out month is never ambiguous, whatever the separator");
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

// Brand names clinics actually print on cards, and the individual components
// of the combination shots — all fold into the right canonical vaccine.
eq(findVaccineInLine("Nobivac DHPPi 08/14/2026")?.canonical, "DHPP", "Nobivac DHPPi is DHPP");
eq(findVaccineInLine("Vanguard Plus 5 booster")?.canonical, "DHPP", "Zoetis Vanguard is DHPP");
eq(findVaccineInLine("Duramune given today")?.canonical, "DHPP", "Duramune is DHPP");
eq(findVaccineInLine("Distemper 08/14/2026")?.canonical, "DHPP", "a bare Distemper line folds into DHPP");
eq(findVaccineInLine("Parvovirus vaccine 08/14/2026")?.canonical, "DHPP", "so does Parvovirus");
eq(findVaccineInLine("Parainfluenza 08/14/2026")?.canonical, "DHPP", "and Parainfluenza");
eq(findVaccineInLine("Felocell 3 01/22/2026")?.canonical, "FVRCP", "Felocell is FVRCP");
eq(findVaccineInLine("Tricat Trio 01/22/2026")?.canonical, "FVRCP", "Tricat Trio is FVRCP");
eq(findVaccineInLine("Panleukopenia 01/22/2026")?.canonical, "FVRCP", "a bare Panleukopenia line folds into FVRCP");
eq(findVaccineInLine("Feline calicivirus 01/22/2026")?.canonical, "FVRCP", "so does Calicivirus");
eq(findVaccineInLine("Canine coronavirus vaccine given")?.canonical, "Canine coronavirus", "canine coronavirus is its own vaccine, not DHPP");
eq(findVaccineInLine("Proheart 12 injection", true), null, "Proheart is a heartworm preventive, not a vaccine");
eq(findVaccineInLine("Recombitek given", true), null, "an ambiguous brand name alone is not matched");

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

// ---- medications on an invoice / priced line -------------------------------
console.log("medications on priced lines");
{
  const inv = `INVOICE - Downtown Pet Clinic
Patient: Rex  Dog  Microchip: 985141002317744
Date of service: 09/28/2026
Rabies vaccination given 09/28/2026 lot RB-2 $48.00
Apoquel 5.4 mg - once daily   $65.00
Simparica Trio 1 chewable - every 30 days   $54.00
Office visit   $60.00`;
  const meds = parseVetReport(inv, { source: "pdf-text" }).report.medications.map((m) => m.name).sort();
  eq(meds, ["Apoquel", "Simparica Trio"], "priced medication lines are extracted; the office-visit charge is not a med");
}

// ---- itemised invoice: administration on the price line --------------------
console.log("itemised invoice line items");
{
  const inv = `INVOICE - Downtown Pet Clinic
Patient: Rex  Dog  Microchip: 985141002317744
Date of service: 09/28/2026
DHPP vaccination given 09/28/2026 lot DH-1 $36.00
Rabies vaccination given 09/28/2026 lot RB-2 $48.00
Wellness exam 1 $65.00
Fecal test 1 $38.00`;
  const r = parseVetReport(inv, { source: "pdf-text" }).report;
  const names = r.vaccinations.map((v) => v.name).sort();
  eq(names, ["DHPP", "Rabies"], "invoice: administered vaccines are extracted from priced line items");
  eq(r.vaccinations.find((v) => v.name === "Rabies")?.administered_on, "2026-09-28", "invoice: the 'given' date on the line is the administered date");
  // A priced but non-administered service must NOT become a vaccination.
  eq(r.vaccinations.some((v) => /exam|fecal/i.test(v.name)), false, "invoice: a plain charge line is not a vaccination");
}

// ---- microchip anywhere on the line -----------------------------------------
console.log("microchip detection");
{
  const inline = `Riverside Vet - Patient: Rex - Dog - Microchip: 985141002317744
Rabies given 14 Aug 2026`;
  eq(parseVetReport(inline, { source: "pdf-text" }).report.pet.microchip_id, "985141002317744", "microchip mid-line is read");
  const transponder = `EUROPEAN PET PASSPORT - VACCINATION AGAINST RABIES
Name: Milo  Species: Cat
Transponder (microchip): 250269604512345
Manufacturer and name of vaccine: Nobivac Rabies
Date of vaccination: 09.03.2026`;
  eq(parseVetReport(transponder, { source: "pdf-text" }).report.pet.microchip_id, "250269604512345", "EU transponder microchip is read");
}

// ---- certificate / passport layouts: one vaccine, fields on labelled lines --
console.log("certificate / passport layouts");
{
  const cert = `RABIES VACCINATION CERTIFICATE
Animal: Cooper  Species: Dog  Breed: Labrador Retriever
Microchip No.: 981020012345678
Vaccine: Rabies (IMRAB 3, killed)
Date Administered: 06/18/2026
Next Due: 06/18/2029
Lot No.: 549871`;
  const v = parseVetReport(cert, { source: "pdf-text" }).report.vaccinations;
  eq(v.length, 1, "rabies certificate yields exactly one vaccination");
  eq(v[0]?.name, "Rabies", "certificate: the vaccine is Rabies");
  eq(v[0]?.administered_on, "2026-06-18", "certificate: date administered is harvested from its labelled line");
  eq(v[0]?.due_on, "2029-06-18", "certificate: next due is harvested from its labelled line");
  eq(v[0]?.lot_number, "549871", "certificate: undashed lot number is harvested");
}
{
  const passport = `EUROPEAN PET PASSPORT - VACCINATION AGAINST RABIES
Name of animal: Milo  Species: Cat  Breed: British Shorthair
Date of birth: 22.04.2022
Transponder (microchip): 250269604512345
Manufacturer and name of vaccine: Nobivac Rabies
Batch number: A159B
Date of vaccination: 09.03.2026
Valid from: 30.03.2026
Valid until: 09.03.2029`;
  const v = parseVetReport(passport, { source: "pdf-text" }).report.vaccinations;
  eq(v.length, 1, "EU passport yields exactly one vaccination");
  eq(v[0]?.name, "Rabies", "passport: the vaccine is Rabies");
  eq(v[0]?.administered_on, "2026-03-09", "passport: 'Date of vaccination' is the administered date, not 'birth' or 'valid from'");
  eq(v[0]?.due_on, "2029-03-09", "passport: 'Valid until' is the due date");
}

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

// ------------------------------------------------------ formats & record types
console.log("formats and record types");

// A vaccine card that lists the DHPP components on separate lines must collapse
// to a single DHPP record, not three, and must not invent a fourth.
const componentCard = `Anytown Animal Hospital
Patient Name: Rex
Date of Service: 14 Aug 2026
VACCINATIONS
Distemper 14 Aug 2026
Adenovirus 14 Aug 2026
Parainfluenza 14 Aug 2026
Parvovirus 14 Aug 2026
Rabies 14 Aug 2026`;
const cc = parseVetReport(componentCard, { source: "pdf-text" }).report;
eq(
  cc.vaccinations.map((v) => v.name).sort(),
  ["DHPP", "Rabies"],
  "four canine-core component lines collapse into one DHPP, alongside Rabies"
);
eq(cc.visit_date, "2026-08-14", "an abbreviated day-first visit date is read");

// Deworming / antiparasitic products are read as medications when the line
// carries a dose or a frequency — verbatim, never rewritten.
const parasite = `Riverside Vet Clinic
Patient Name: Rex
Date of Service: 14-Aug-2026
MEDICATIONS
Panacur (fenbendazole) 222 mg — 1 sachet once daily for 3 days
Drontal Plus — give 1 tablet by mouth once`;
const pr = parseVetReport(parasite, { source: "pdf-text" }).report;
eq(pr.medications.find((m) => /panacur/i.test(m.name))?.dosage, "222 mg", "a dewormer's dose is transcribed verbatim");
eq(pr.medications.find((m) => /panacur/i.test(m.name))?.frequency, "once daily for 3 days", "with its course kept as printed");
eq(pr.medications.some((m) => /drontal/i.test(m.name)), true, "a count-only dewormer is still recorded");

// Diagnostic vitals become trackable additional fields, typed and united.
const vitals = `Anytown Animal Hospital
Patient Name: Rex
Date of Service: 14 Aug 2026
DIAGNOSTICS
Temperature: 101.4 F
Heart rate: 88 bpm
Respiratory rate: 24 rpm
Heartworm test: Negative`;
const vt = parseVetReport(vitals, { source: "pdf-text" }).report;
const temp = vt.additional_fields.find((f) => /temperature/i.test(f.label));
eq(temp?.value, "101.4", "temperature is captured as a number");
eq(temp?.unit, "°F", "with its unit normalised");
eq(temp?.value_type, "number", "and typed as a number");
eq(vt.additional_fields.find((f) => /heart rate/i.test(f.label))?.unit, "bpm", "heart rate keeps its unit");
eq(vt.additional_fields.find((f) => /heartworm/i.test(f.label))?.value_type, "boolean", "a positive/negative test is a boolean field");

// Weight in either unit, with or without a space; kilograms pass straight through.
const kg = parseVetReport(`Vet Clinic\nPatient Name: Rex\nDate of Service: 14 Aug 2026\nWeight: 4.6kg\nRabies given 14 Aug 2026`, { source: "pdf-text" }).report;
eq(kg.weight_kg, 4.6, "a weight already in kg is not converted");
const lbs = parseVetReport(`Vet Clinic\nPatient Name: Rex\nDate of Service: 14 Aug 2026\nWeight: 20.7 lbs\nRabies given 14 Aug 2026`, { source: "pdf-text" }).report;
eq(lbs.weight_kg, Math.round(20.7 * LB_TO_KG * 100) / 100, "'20.7 lbs' converts to kilograms");

// Common dosing shorthands are captured as the frequency, verbatim.
const freqDoc = (line: string) =>
  parseVetReport(`Vet Clinic\nPatient Name: Rex\nDate of Service: 14 Aug 2026\nMEDICATIONS\n${line}`, { source: "pdf-text" }).report.medications[0];
eq(freqDoc("Gabapentin 100 mg — 1 capsule PO q12h")?.frequency, "q12h", "q12h is read as a frequency");
eq(freqDoc("Gabapentin 100 mg — 1 capsule PO q12h")?.dosage, "100 mg", "and the mass strength is the dose, not the capsule count");
eq(freqDoc("Meloxicam 1.5 mg/ml — give 0.4 ml every 24 hours")?.dosage, "0.4 ml", "the delivered volume is the dose, not the concentration");
eq(freqDoc("Clavamox 62.5 mg give twice a day for 10 days")?.frequency, "twice a day for 10 days", "'twice a day for 10 days' is kept whole");

// --- scale-test hardening (150 labelled-doc benchmark) ---------------------

// Microchip synonyms a clinic actually prints mid-line: "Chip ID", "Microchip #:".
const chipSyn = (line: string) =>
  parseVetReport(`Somerville Animal Hospital\nPatient: Rex  dog  ${line}\nRabies given 14 Aug 2026 lot RB-1`, { source: "pdf-text" }).report.pet.microchip_id;
eq(chipSyn("Chip ID 985141002317744"), "985141002317744", "'Chip ID <15 digits>' mid-line is read");
eq(chipSyn("Microchip #: 985141002317744"), "985141002317744", "'Microchip #:' with a hash separator is read");
eq(chipSyn("Chip No. 985141002317744"), "985141002317744", "'Chip No.' mid-line is read");

// A truncated microchip is worse than none: 11-14 (or 16) digits is an OCR digit
// drop, not a real chip, so it must be left blank rather than saved wrong.
eq(
  parseVetReport(`Riverside Vet\nPatient: Bella  cat  Microchip: 9851410023177\nRabies given 14 Aug 2026 lot RB-2`, { source: "ocr" }).report.pet.microchip_id,
  null,
  "a 13-digit microchip (OCR dropped digits) is rejected, not surfaced wrong",
);

// OCR renders "lb" as "|b" (an 'l' becomes a pipe); the weight must still convert.
const wtPipe = parseVetReport(`Vet Clinic\nPatient: Rex  dog  Microchip: 985141002317744\nWeight: 10.4 |b\nRabies given 14 Aug 2026 lot RB-3`, { source: "ocr" }).report;
eq(wtPipe.weight_kg, Math.round(10.4 * LB_TO_KG * 100) / 100, "'10.4 |b' (OCR for lb) converts to kilograms");

// A unit-less preventive dosed "1 dose" is a real medication, even on a priced line.
const oneDose = parseVetReport(`INVOICE - Downtown Pet Clinic\nPatient: Luna  cat  Microchip: 985141002317744\nRevolution Plus 1 dose - monthly   $54.00\nRabies vaccination given 14 Aug 2026 lot RB-4`, { source: "pdf-text" }).report;
eq(oneDose.medications.some((m) => /revolution/i.test(m.name)), true, "'Revolution Plus 1 dose - monthly' on a priced line is captured");
eq(oneDose.medications.some((m) => /\$/.test(m.name) || /\$|54/.test(m.frequency ?? "")), false, "and the $54 price does not bleed into the medication");

// An EU passport's title line "VACCINATION AGAINST RABIES" is a heading, not a
// second vaccine — so the real (single) vaccine's date is still harvested.
const passport = parseVetReport(
  `EUROPEAN PET PASSPORT - VACCINATION AGAINST RABIES\nName of animal: Milo  Species: cat\nTransponder (microchip): 985141002317744\nManufacturer and name of vaccine: Nobivac FVRCP\nBatch number: LP-5893541\nDate of vaccination: 15/10/2026\nValid until: 15/10/2027`,
  { source: "pdf-text" },
).report;
eq(passport.vaccinations.length, 1, "the 'against rabies' title is not counted as a vaccine");
eq(passport.vaccinations[0]?.administered_on, "2026-10-15", "the passport's real vaccine keeps its date of vaccination");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
