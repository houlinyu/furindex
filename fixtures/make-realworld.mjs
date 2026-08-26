/**
 * Text-layer PDF fixtures modelled on REAL vet-record templates in common use,
 * for benchmarking extraction against formats a clinic actually hands an owner.
 *
 *   rw1  US rabies vaccination certificate (NASPHV layout)
 *   rw2  AAHA-style multi-vaccine record (dated rows, lot + next-due)
 *   rw3  EU pet passport vaccination page (DD.MM.YYYY dates, microchip)
 *   rw4  itemised clinic invoice (wellness exam + preventives)
 *   rw5  boarding intake form (vaccine status a kennel needs)
 *
 * Ground truth is written to realworld.expect.json beside the PDFs.
 *
 *   node fixtures/make-realworld.mjs
 */
import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(OUT, { recursive: true });

const expect = {};
const pending = [];

/** Build one PDF from an array of [style, text] lines, then end it. */
function make(name, lines, truth) {
  const d = new PDFDocument({ size: "LETTER", margin: 50 });
  const finished = new Promise((res) =>
    d.pipe(createWriteStream(join(OUT, name))).on("finish", res)
  );
  for (const [style, text, size] of lines) {
    if (style === "h") d.font("Helvetica-Bold").fontSize(size ?? 14).text(text).moveDown(0.4);
    else if (style === "b") d.font("Helvetica-Bold").fontSize(size ?? 10).text(text).moveDown(0.2);
    else if (style === "gap") d.moveDown(0.4);
    else d.font("Helvetica").fontSize(size ?? 10).text(text).moveDown(0.2);
  }
  d.end();
  pending.push(finished);
  expect[name] = truth;
}

make(
  "rw1-rabies-cert.pdf",
  [
    ["h", "RABIES VACCINATION CERTIFICATE"],
    ["p", "National Association of State Public Health Veterinarians (NASPHV)"],
    ["gap"],
    ["b", "Owner: Jordan Lee    Phone: (617) 555-0142"],
    ["p", "Address: 14 Elm Street, Somerville, MA 02143"],
    ["gap"],
    ["b", "Animal: Cooper    Species: Dog    Breed: Labrador Retriever"],
    ["p", "Sex: Male (neutered)    Color: Yellow    Date of Birth: 03/12/2021"],
    ["p", "Microchip No.: 981020012345678"],
    ["gap"],
    ["b", "Vaccine: Rabies (IMRAB 3, killed)"],
    ["p", "Date Administered: 06/18/2026"],
    ["p", "Duration: 3 years    Next Due: 06/18/2029"],
    ["p", "Lot No.: 549871    Lot Expiration: 09/2027"],
    ["p", "Veterinarian: Dr. A. Patel, DVM    License: MA-8841"],
    ["p", "Clinic: Somerville Animal Hospital"],
  ],
  { microchip: "981020012345678", vaccine: "rabies", given: "2026-06-18", due: "2029-06-18", lot: "549871" }
);

make(
  "rw2-aaha-record.pdf",
  [
    ["h", "VACCINATION RECORD"],
    ["p", "Riverside Veterinary Group  -  Patient: Bella  -  Canine  -  DOB 05/2020"],
    ["p", "Microchip: 985141002317744"],
    ["gap"],
    ["b", "Vaccine            Date Given     Next Due       Lot"],
    ["p", "DHPP               14 Aug 2026    14 Aug 2027    DH-8820134"],
    ["p", "Rabies (3 yr)      14 Aug 2026    14 Aug 2029    RB-4471902"],
    ["p", "Bordetella         14 Aug 2026    14 Feb 2027    BD-3312007"],
    ["p", "Leptospirosis      14 Aug 2026    14 Aug 2027    LP-5590021"],
    ["gap"],
    ["b", "Weight: 24.6 kg    Temperature: 38.5 C"],
  ],
  { microchip: "985141002317744", vaccines: ["DHPP", "Rabies", "Bordetella", "Leptospirosis"], weight_kg: 24.6, given: "2026-08-14" }
);

make(
  "rw3-eu-passport.pdf",
  [
    ["h", "EUROPEAN PET PASSPORT - VACCINATION AGAINST RABIES"],
    ["p", "Name of animal: Milo    Species: Cat    Breed: British Shorthair"],
    ["p", "Sex: Male    Date of birth: 22.04.2022"],
    ["p", "Transponder (microchip): 250269604512345"],
    ["gap"],
    ["b", "Manufacturer and name of vaccine: Nobivac Rabies"],
    ["p", "Batch number: A159B"],
    ["p", "Date of vaccination: 09.03.2026"],
    ["p", "Valid from: 30.03.2026    Valid until: 09.03.2029"],
    ["p", "Authorised veterinarian: Dr. M. Rossi"],
  ],
  { microchip: "250269604512345", vaccine: "rabies", given: "2026-03-09", due: "2029-03-09" }
);

make(
  "rw4-itemised-invoice.pdf",
  [
    ["h", "INVOICE - Downtown Pet Clinic"],
    ["p", "Patient: Luna    Feline    Owner: Sam Okafor"],
    ["p", "Date of service: 2026-07-30    Invoice #: 20487"],
    ["gap"],
    ["b", "Description                          Qty     Amount"],
    ["p", "Comprehensive wellness exam          1       $65.00"],
    ["p", "FVRCP vaccination                    1       $32.00"],
    ["p", "Rabies vaccination (1 yr)            1       $28.00"],
    ["p", "Revolution Plus (5.5-11 lb)          1       $54.00"],
    ["p", "Fecal test                           1       $38.00"],
    ["gap"],
    ["b", "Subtotal: $217.00    Tax: $0.00    Total Due: $217.00"],
    ["gap"],
    ["p", "Weight recorded: 4.2 kg"],
    ["p", "Next wellness visit recommended: 2027-07-30"],
  ],
  { visited_on: "2026-07-30", clinic: "downtown pet clinic", cost_total: 217.0, weight_kg: 4.2, vaccines: ["FVRCP", "Rabies"], medication: "revolution" }
);

make(
  "rw5-boarding-intake.pdf",
  [
    ["h", "BOARDING INTAKE - Happy Tails Kennel"],
    ["p", "Pet name: Rex    Dog    Breed: German Shepherd    Weight: 34 kg"],
    ["p", "Owner: Priya N.    Emergency contact: (415) 555-0199"],
    ["gap"],
    ["b", "Required vaccinations (must be current):"],
    ["p", "Rabies - given 01/15/2026, expires 01/15/2029"],
    ["p", "DHPP - given 01/15/2026, expires 01/15/2027"],
    ["p", "Bordetella - given 07/01/2026, expires 01/01/2027"],
    ["gap"],
    ["b", "Current medications:"],
    ["p", "Apoquel 16 mg - once daily for itching"],
    ["p", "Heartgard Plus - monthly"],
  ],
  { breed: "german shepherd", weight_kg: 34, vaccines: ["Rabies", "DHPP", "Bordetella"], medications: ["apoquel", "heartgard"], given: "2026-01-15" }
);

await Promise.all(pending);
writeFileSync(join(OUT, "realworld.expect.json"), JSON.stringify(expect, null, 2));
console.log(`wrote ${Object.keys(expect).length} real-world template PDFs + realworld.expect.json`);
