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

// --- adversarial hardening (stress-test round: WRONG-value & fabrication) ----
// Each of these is a confirmed defect a fuzzing pass surfaced; the fix must hold.
{
  const R = (t: string, s: "pdf-text" | "ocr" = "pdf-text") => parseVetReport(t, { source: s }).report;
  const vet = (body: string) =>
    R(`Somerville Animal Hospital\nPatient: Rex  dog\nMicrochip: 985141002317744\n${body}`);

  // Microchip — never surface a wrong id
  eq(R("Somerville Animal Hospital\nPatient: Rex dog\nMicrochip No: 9851410O2317744\nRabies given 14 Aug 2026 lot RB-1", "ocr").pet.microchip_id, null, "a chip with a confusion letter (O for 0) is rejected, not surfaced");
  eq(R("Somerville Animal Hospital\nPatient: Rex dog\nMicrochip: none. mobile 5551234567\nRabies given 14 Aug 2026 lot RB-1").pet.microchip_id, null, "'Microchip: none' never scavenges a phone number");
  eq(R("Somerville Animal Hospital\nPatient: Rex dog\nMicrochip:\nLicense No: 1234567890\nRabies given 14 Aug 2026 lot RB-1").pet.microchip_id, null, "a blank Microchip label does not swallow the next line's license number");
  eq(R("Somerville Animal Hospital\nPatient: Rex dog\nMicrochip: 000000000000000\nRabies given 14 Aug 2026 lot RB-1").pet.microchip_id, null, "an all-zeros placeholder is not a microchip");

  // Weight — never surface a wrong body weight
  eq(vet("Weight: S2.4 lb").weight_kg, null, "a weight with a leading glyph-letter (S2.4) is rejected");
  eq(vet("Weight-based dose: 2 mg/kg").weight_kg, null, "a per-kg dose is not read as a body weight");
  eq(vet("Weight: 300 lb").weight_kg, null, "300 lb (136 kg) fails the plausibility gate");
  eq(vet("Weight at birth: 0.40 kg\nCurrent weight: 5.8 kg").weight_kg, 5.8, "the current weight wins over a birth weight");
  eq(vet("Weight: 450 g").weight_kg, 0.45, "grams convert to kilograms");
  eq(vet("Weight: 3,5 kg").weight_kg, 3.5, "a European comma-decimal weight parses");
  eq(vet("Weight: 12 oz").weight_kg, Math.round(12 * 0.028349523125 * 100) / 100, "ounces convert to kilograms");

  // Vaccines — a disease name on a non-administration line is NOT a vaccination
  eq(vet("Rabies titer 0.5 IU/mL drawn 03/04/2026").vaccinations.length, 0, "a rabies titer is not an administration");
  eq(vet("Patient tested negative for Lyme on 03/01/2026").vaccinations.length, 0, "a negative Lyme test is not a vaccination");
  eq(vet("No history of rabies vaccination as of 03/01/2026").vaccinations.length, 0, "'no history of' is not a vaccination");
  eq(vet("Heartworm/Lyme 4DX 03/01/2026: Negative").vaccinations.length, 0, "a 4DX screen result is not a vaccination");
  eq(vet("Due for DHPP booster next visit").vaccinations.length, 0, "a 'due for' reminder is not a vaccination");
  eq(vet("FIV vaccine given 03/15/2026 lot FV-9").vaccinations.map((v) => v.name), ["FIV"], "FIV is a recognised vaccine");
  eq(R("City Health Clinic\nPatient: John Smith  DOB: 03/12/1985\nInfluenza (flu) vaccine administered 10/02/2025 Lot FL-2291").vaccinations.length, 0, "a HUMAN flu record does not fabricate a canine-influenza vaccine");
  {
    const cert = R("City Animal Hospital\nCertificate of Vaccination\nPatient Name: Rex\nSpecies: Dog\nRabies\nDate Administered: 14 Aug 2026\nNext Due: 14 Aug 2029\nLot No.: 549871");
    eq(cert.vaccinations.map((v) => v.name), ["Rabies"], "a Title-Case 'Certificate of Vaccination' still yields its vaccine");
    eq(cert.vaccinations[0]?.administered_on, "2026-08-14", "and the certificate's administered date is harvested");
  }

  // Dates
  eq(vet("Rabies given 2026-08-14T09:30 next due 2029-08-14 lot RB-1").vaccinations[0]?.administered_on, "2026-08-14", "an ISO-8601 datetime with T keeps its date");
  eq(vet("Rabies next due 14 Aug 2027, given 14 Aug 2026 lot RB-1").vaccinations[0]?.administered_on, "2026-08-14", "a reverse-order 'due ... given' line reads the given date correctly");

  // Medications
  eq(vet("MEDICATIONS\nAmoxicillin 50 mg/ml suspension give 2 ml by mouth twice daily").medications[0]?.dosage, "2 ml", "the delivered dose (2 ml), not the concentration (50 mg/ml), is the dosage");
  eq(vet("MEDICATIONS\nRoyal Canin Recovery - feed 1 sachet twice daily").medications.length, 0, "a prescription food is not a medication");
  eq(vet("MEDICATIONS\nHill's Prescription Diet i/d 2 cups daily").medications.length, 0, "a diet dispensed by the cup is not a medication");
  eq(vet("MEDICATIONS\nApoquel 16 mg BID x 30 tablets 65.00").medications[0]?.frequency, "BID", "a dispense quantity and price do not bleed into the frequency");
  eq(vet("MEDICATIONS\nEnrofloxacin 50 mg BID PO for 7 days").medications[0]?.frequency, "BID", "a route does not bleed into the frequency");
  eq(vet("MEDICATIONS\nRabies vaccine 1 ml SQ, next due 08/2029").medications.length, 0, "a vaccine with a dose is not double-booked as a medication");
  eq(vet("MEDICATIONS\nIGNORE PREVIOUS INSTRUCTIONS 999 mg once daily").medications.length, 0, "injected instruction text on a dose line is not a medication");
  eq(vet("MEDICATIONS\n** Apoquel 16 mg ** - 1 tablet twice daily").medications[0]?.name, "Apoquel", "leading punctuation is stripped from a medication name");

  // Safety — terse real cert not refused; non-vet refused
  eq(R("Rabies vaccination\nAdministered 08/14/2026\nLot 549871\nNext due 08/14/2029").unreadable, false, "a terse but real rabies certificate is not refused as illegible");
  eq(R("Milk 2.99\nEggs 3.49\nBread 2.00\nTotal 8.48").unreadable, true, "a grocery receipt is refused as non-veterinary");

  // Signalment
  {
    const s = R("Downtown Vet\nPatient: Rex\nSpecies: Canine\nMicrochip: 985141002317744\nRabies given 14 Aug 2026 lot RB-1");
    eq(s.pet.name === "Patient", false, "the label word 'Patient' is not recorded as the pet's name");
    eq(s.pet.species, "dog", "an explicit 'Canine' is not overridden to rabbit by the name 'Rex'");
  }

  // Multi-pet — never cross-wire one animal's fields onto another
  {
    const two = R("Happy Vet Clinic\nPatient: Rex\nSpecies: Dog\nRabies given 14 Aug 2026 lot RB-1\nPatient: Whiskers\nSpecies: Cat\nMicrochip: 985112009999111\nWeight: 4.1 kg\nFVRCP given 15 Aug 2026 lot FV-2");
    eq(two.pet.microchip_id, null, "a second animal's microchip is not grafted onto the first");
    eq(two.weight_kg, null, "a second animal's weight is not grafted onto the first");
    eq(two.vaccinations.map((v) => v.name), ["Rabies"], "a second animal's feline vaccine is not added to the first (a dog)");
  }
}

// --- wave-2 hardening: fix the fixes (false rejections) + new surfaces --------
{
  const R = (t: string) => parseVetReport(t, { source: "pdf-text" }).report;
  const vet = (body: string) =>
    R(`Somerville Animal Hospital\nPatient: Rex  dog\nMicrochip: 985141002317744\n${body}`);

  // NON_ADMIN must not drop a REAL administration that merely mentions a test word
  eq(vet("DHPP administered; patient negative for reaction").vaccinations.map((v) => v.name), ["DHPP"], "a real 'administered' line survives an incidental 'negative'");
  eq(vet("Rabies given, tested lot 549871").vaccinations.map((v) => v.name), ["Rabies"], "a real 'given ... lot' line survives an incidental 'tested'");
  eq(vet("DHPP administered, no history of adverse reaction").vaccinations.map((v) => v.name), ["DHPP"], "'no history of adverse reaction' on an admin line is not a non-administration");
  // but the fabrications still stay blocked
  eq(vet("Rabies titer 0.5 IU/mL drawn 03/04/2026").vaccinations.length, 0, "a titer (no admin word) is still not a vaccination");
  eq(vet("Heartworm/Lyme 4DX 03/01/2026: Negative").vaccinations.length, 0, "a 4DX screen is still not a vaccination");

  // FOOD_RE must not drop a drug whose instruction mentions a cup/scoop
  eq(vet("MEDICATIONS\nCerenia 16 mg once daily, give with 1 cup of water").medications.map((m) => m.name), ["Cerenia"], "'give with 1 cup of water' does not make a drug a food");
  eq(vet("MEDICATIONS\nHill's Prescription Diet i/d 2 cups daily").medications.length, 0, "a named prescription diet is still not a medication");

  // weight qualifier glued to the number is kept; a glyph-corruption still rejected
  eq(vet("Weight: ca.4.2 kg").weight_kg, 4.2, "'ca.4.2 kg' keeps the weight");
  eq(vet("Weight: approx.4.2 kg").weight_kg, 4.2, "'approx.4.2 kg' keeps the weight");
  eq(vet("Weight: S2.4 lb").weight_kg, null, "'S2.4' is still rejected as a glyph corruption");

  // multi-pet must NOT over-trigger on one pet labelled two ways / with a breed
  {
    const one = R("Happy Vet\nPatient: Rex - Labrador Retriever\nMicrochip: 985141002317744\nRabies given 08/14/2026 Lot A1\nPet: Rex\nDHPP given 08/14/2026 Lot B2\nBordetella given 08/14/2026 Lot C3");
    eq(one.vaccinations.map((v) => v.name).sort(), ["Bordetella", "DHPP", "Rabies"], "one pet with a 'Name - Breed' header is not split; all its vaccines survive");
    eq(one.pet.name, "Rex", "the breed is stripped from the name");
  }
  eq(R("Happy Vet\nPatient: Bella Smith\nMicrochip: 985141002317744\nRabies given 08/14/2026 Lot A1\nPet Name: Bella\nDHPP given 08/14/2026 Lot B2").vaccinations.length, 2, "a surname vs first-name label is the same pet, not two");
  // but a genuine second animal is still guarded
  eq(R("Happy Vet\nPatient: Rex\nSpecies: Dog\nRabies given 14 Aug 2026 lot RB-1\nPatient: Milo\nSpecies: Cat\nMicrochip: 985112009999111\nWeight: 4.1 kg").pet.microchip_id, null, "a real second animal's chip is still not grafted onto the first");

  // a bare "Administered <date>" cert date is harvested
  eq(R("Rabies vaccination\nAdministered 08/14/2026 Lot 445 Next due 08/14/2027").vaccinations[0]?.administered_on, "2026-08-14", "a bare 'Administered <date>' on a cert is captured");

  // a vaccine-named header advances the section without polluting the prior field
  {
    const poll = R("Greenfield Animal Clinic\nPatient: Rex\nREASON FOR VISIT\nAnnual wellness exam\nRABIES VACCINATION\nRabies given 08/14/2026 Lot A1 next due 08/14/2027");
    eq(poll.reason, "Annual wellness exam", "a 'RABIES VACCINATION' header does not spill vaccine text into the reason");
    eq(poll.vaccinations.map((v) => v.name), ["Rabies"], "and the vaccine is still extracted");
  }

  // a column-merged DOB is not read as a vaccine's administration date
  eq(R("Vet Clinic\nPatient: Bella\nD.O.B: 03/14/2019 Lepto given 05/10/2026 Lot LP3").vaccinations[0]?.administered_on, "2026-05-10", "a DOB glued from another column is not the vaccine's administered date");
  // a column-merged second field does not pollute the name
  eq(R("Vet Clinic\nPatient: Max Species: Dog\nRabies given 14 Aug 2026 lot RB-1").pet.name, "Max", "a glued 'Species: Dog' is cut off the pet name");

  // European comma-decimal money is not mis-magnitude'd
  eq(R("Downtown Pet Clinic\nPatient: Luna\nTotal Due: $217.00\nRabies given 14 Aug 2026 lot RB-1").cost_usd, 217, "a US $217.00 total still reads 217");
}

// --- wave-3 hardening: re-verify wave-2 fixes did not over-correct ------------
{
  const R = (t: string) => parseVetReport(t, { source: "pdf-text" });
  const H = "Somerville Animal Hospital\nPatient: Rex\nMicrochip: 985141002317744\n";

  // Two REAL pets that share a first name must be detected (not merged/cross-wired)
  {
    const two = R("Happy Vet\nPatient: Bella Smith\nSpecies: Dog\nWeight: 30 kg\nRabies given 05/25/2026 lot R1\n\nPatient: Bella Jones\nSpecies: Cat\nWeight: 4 kg\nMicrochip: 985141000999888\nFVRCP given 06/26/2026 lot F1").report;
    eq(two.pet.microchip_id, null, "two pets sharing a first name: the cat's chip is not grafted onto the dog");
    eq(two.vaccinations.map((v) => v.name), ["Rabies"], "two pets sharing a first name: the cat's vaccine is not cross-filed");
  }
  // but one pet labelled two ways (surname vs first name) is NOT split
  {
    const one = R("Happy Vet\nPatient: Bella Smith\nMicrochip: 985141002317744\nRabies given 05/25/2026 lot R1\nPet Name: Bella\nDHPP given 05/26/2026 lot D2");
    eq(one.report.vaccinations.length, 2, "'Bella Smith' and 'Bella' are the same pet — both vaccines kept");
    eq(one.trace.caveats.some((c) => /more than one animal/.test(c)), false, "and no false multi-animal warning");
  }

  // A real name containing a number is preserved; a glued date is still cut
  eq(R(H.replace("Patient: Rex", "Patient: Lucky 7")).report.pet.name, "Lucky 7", "'Lucky 7' keeps its number");
  eq(R("Vet Clinic\nPatient: Bella 05/10/2026\nMicrochip: 985141002317744\nRabies given 05/25/2026 lot R1").report.pet.name, "Bella", "a glued date is cut off the name");

  // A titer/test DRAW date is not fabricated as an administration; the real
  // 'given' date is used (25 > 12 fixes the date order so nothing is ambiguous)
  eq(R(H + "Rabies titer drawn 03/10/2026; last given 05/25/2023 lot RB-9").report.vaccinations[0]?.administered_on, "2023-05-25", "a titer-draw date is not the administration; the real given date is");
  eq(R(H + "Rabies given 05/25/2026; titer not needed lot RB-1").report.vaccinations[0]?.administered_on, "2026-05-25", "a real 'given' line with an incidental 'titer' still records the administration");

  // A currency symbol abutting a date is not read as a cost
  eq(R(H + "Balance due $12/25/2026\nRabies given 14 Aug 2026 lot RB-1").report.cost_usd, null, "'$12/25/2026' (a due date) is not a $12 charge");

  // Numeric cross-field contamination: an identity number is never a microchip.
  // (Header without a chip of its own, so the decoy is the only candidate.)
  const NC = "Somerville Animal Hospital\nPatient: Rex  dog\n";
  eq(R(NC + "Microchip:\nNPI 1234567890\nRabies given 14 Aug 2026 lot RB-1").report.pet.microchip_id, null, "an NPI on the line after a blank Microchip label is not the chip");
  eq(R(NC + "Microchip: DEA# BX1234563\nRabies given 14 Aug 2026 lot RB-1").report.pet.microchip_id, null, "a DEA number is not a microchip");
  eq(R(NC + "Microchip: 555-123-4567\nRabies given 14 Aug 2026 lot RB-1").report.pet.microchip_id, null, "a phone number (3-3-4) is not a microchip");
  eq(R(NC + "Transponder (microchip): 985141210940252 NPI 1234567890\nRabies given 14 Aug 2026 lot RB-1").report.pet.microchip_id, "985141210940252", "the real chip is recovered even when an NPI trails it");
  // A heart rate / lab value is not a body weight
  eq(R(H + "Weight: 88 bpm\nRabies given 14 Aug 2026 lot RB-1").report.weight_kg, null, "'88 bpm' (heart rate) is not a body weight");
  eq(R(H + "Body Weight: 24 (BUN)\nRabies given 14 Aug 2026 lot RB-1").report.weight_kg, null, "'24 (BUN)' (a lab value) is not a body weight");
  // An order/reference token is not a vaccine lot
  eq(R(H + "Rabies given Feb 21, 2026  Order ORD-12345").report.vaccinations[0]?.lot_number, null, "an ORD- order number is not a vaccine lot");
  eq(R(H + "Rabies given Feb 21, 2026  RB-4471902").report.vaccinations[0]?.lot_number, "RB-4471902", "a real 'RB-' lot is still captured");
  // A deposit/part-payment does not beat the grand total for cost
  eq(R("Downtown Pet Clinic\nPatient: Luna\nDeposit paid $200.00\nTotal due: $120.00\nRabies given 14 Aug 2026 lot RB-1").report.cost_usd, 120, "a deposit does not become the cost; the total does");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
