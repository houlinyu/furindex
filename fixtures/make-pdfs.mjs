/**
 * Generates the text-layer PDF fixtures. These are what a clinic's practice
 * management system actually produces: laid out with real fonts and a real
 * text layer, so Layer 1 can read them exactly.
 *
 *   node fixtures/make-pdfs.mjs
 */
import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(OUT, { recursive: true });

function doc(name) {
  const d = new PDFDocument({ size: "LETTER", margin: 50 });
  const done = new Promise((res) => d.pipe(createWriteStream(join(OUT, name))).on("finish", res));
  return [d, done];
}

/** A two-column "Label   Value" row, the shape most invoices use. */
function kv(d, label, value, opts = {}) {
  const y = d.y;
  d.font("Helvetica-Bold").fontSize(9).text(label, 50, y, { width: 130 });
  d.font("Helvetica").fontSize(9).text(value, 185, y, { width: opts.width ?? 360 });
  d.moveDown(0.25);
}

function rule(d) {
  d.moveDown(0.4);
  d.moveTo(50, d.y).lineTo(562, d.y).lineWidth(0.5).strokeColor("#bbbbbb").stroke();
  d.moveDown(0.5);
  d.fillColor("#000000");
}

function h(d, t) {
  d.moveDown(0.6);
  d.font("Helvetica-Bold").fontSize(10.5).fillColor("#1a3a5c").text(t, 50, d.y);
  d.fillColor("#000000");
  d.moveDown(0.25);
}

// ---------------------------------------------------------------- F1: US invoice
{
  const [d, done] = doc("f1-invoice-textlayer.pdf");
  d.font("Helvetica-Bold").fontSize(16).text("Cambridge Veterinary Associates");
  d.font("Helvetica").fontSize(8.5).fillColor("#555555");
  d.text("128 Massachusetts Avenue, Cambridge, MA 02139   ·   (617) 555-0142   ·   care@camvet.example");
  d.fillColor("#000000");
  rule(d);

  d.font("Helvetica-Bold").fontSize(12).text("INVOICE  #  INV-2026-08814");
  d.moveDown(0.5);

  kv(d, "Date of Service:", "August 14, 2026");
  kv(d, "Attending:", "Dr. Priya Raman, DVM");
  kv(d, "Client:", "Hannah Wu   ·   41 Trowbridge St, Cambridge MA   ·   (617) 555-0199");

  h(d, "PATIENT");
  kv(d, "Patient Name:", "Mochi");
  kv(d, "Species:", "Canine");
  kv(d, "Breed:", "Shiba Inu");
  kv(d, "Sex:", "Female (spayed)");
  kv(d, "Date of Birth:", "04/18/2021");
  kv(d, "Microchip:", "985141002317744");
  kv(d, "Weight:", "20.7 lb");

  h(d, "REASON FOR VISIT");
  d.font("Helvetica").fontSize(9).text("Annual wellness examination and vaccination update.", 50, d.y, { width: 500 });

  h(d, "ASSESSMENT");
  d.font("Helvetica").fontSize(9).text("Healthy. Mild dental calculus, grade 1.", 50, d.y, { width: 500 });

  h(d, "VACCINATIONS ADMINISTERED");
  const vaxCols = [50, 190, 275, 360, 450];
  d.font("Helvetica-Bold").fontSize(8.5);
  const hy = d.y;
  ["Vaccine", "Given", "Next Due", "Lot No.", "Site"].forEach((t, i) => d.text(t, vaxCols[i], hy, { width: 120, lineBreak: false }));
  d.y = hy;
  d.moveDown(1.1);
  d.font("Helvetica").fontSize(8.5);
  const vax = [
    ["Rabies (3 year)", "08/14/2026", "08/14/2029", "RB-4471902", "R rear limb"],
    ["DHPP", "08/14/2026", "08/14/2027", "DH-8820134", "L rear limb"],
    ["Bordetella (oral)", "08/14/2026", "02/14/2027", "BD-3312007", "Oral"],
  ];
  for (const row of vax) {
    const y = d.y;
    row.forEach((t, i) => d.text(t, vaxCols[i], y, { width: 125, lineBreak: false }));
    d.y = y;
    d.moveDown(0.85);
  }

  h(d, "MEDICATIONS DISPENSED");
  d.font("Helvetica").fontSize(9);
  d.text("Apoquel (oclacitinib) 5.4 mg  —  Give 1 tablet by mouth twice daily for 14 days.", 50, d.y, { width: 500 });
  d.moveDown(0.3);
  d.text("Simparica Trio 10-20 kg chewable  —  Give 1 chewable by mouth every 30 days.", 50, d.y, { width: 500 });

  h(d, "DIAGNOSTICS");
  kv(d, "Heartworm antigen:", "Negative");
  kv(d, "Temperature:", "101.4 F");
  kv(d, "Body condition score:", "5/9");

  h(d, "CHARGES");
  d.font("Helvetica").fontSize(9);
  const charges = [
    ["Comprehensive physical examination", "78.00"],
    ["Rabies vaccine, 3 year", "32.00"],
    ["DHPP vaccine", "38.00"],
    ["Bordetella vaccine, oral", "29.50"],
    ["Heartworm antigen test (4Dx)", "52.00"],
    ["Apoquel 5.4 mg x 28 tablets", "55.00"],
  ];
  for (const [desc, amt] of charges) {
    const y = d.y;
    d.text(desc, 50, y, { width: 380, lineBreak: false });
    d.text("$" + amt, 470, y, { width: 80, align: "right", lineBreak: false });
    d.y = y;
    d.moveDown(0.85);
  }
  rule(d);
  const ty = d.y;
  d.font("Helvetica-Bold").fontSize(10).text("TOTAL DUE", 50, ty, { lineBreak: false });
  d.text("$284.50", 470, ty, { width: 80, align: "right", lineBreak: false });

  d.end();
  await done;
}

// ------------------------------------------------------- F5: UK discharge summary
{
  const [d, done] = doc("f5-discharge-uk.pdf");
  d.font("Helvetica-Bold").fontSize(16).text("Bristol Veterinary Centre");
  d.font("Helvetica").fontSize(8.5).fillColor("#555555");
  d.text("22 Whiteladies Road, Clifton, Bristol BS8 1TH   ·   Tel +44 117 555 0188");
  d.fillColor("#000000");
  rule(d);

  d.font("Helvetica-Bold").fontSize(12).text("DISCHARGE SUMMARY");
  d.moveDown(0.5);

  kv(d, "Date of visit:", "03/04/2026");
  kv(d, "Seen by:", "Ms. E. Okafor MRCVS");

  h(d, "PATIENT");
  kv(d, "Name:", "Biscuit");
  kv(d, "Species:", "Feline");
  kv(d, "Breed:", "Domestic Shorthair");
  kv(d, "Sex:", "Male (neutered)");
  kv(d, "D.O.B.:", "11/09/2019");
  kv(d, "Microchip:", "981020012345678");
  kv(d, "Weight:", "4.6 kg");

  h(d, "PRESENTING COMPLAINT");
  d.font("Helvetica").fontSize(9).text("Lameness of the left hind limb, three days' duration.", 50, d.y, { width: 500 });

  h(d, "DIAGNOSIS");
  d.font("Helvetica").fontSize(9).text("Soft tissue strain, left stifle. No radiographic abnormality.", 50, d.y, { width: 500 });

  h(d, "VACCINATIONS GIVEN TODAY");
  d.font("Helvetica").fontSize(9);
  d.text("Feline RCP (FVRCP) — given 03/04/2026, next due 03/04/2027, batch 2026A-778", 50, d.y, { width: 500 });
  d.moveDown(0.3);
  d.text("Leptospirosis booster deferred; recheck 14/08/2026.", 50, d.y, { width: 500 });

  h(d, "MEDICATION TO GO HOME");
  d.font("Helvetica").fontSize(9);
  d.text("Metacam (meloxicam) 0.5 mg/ml oral suspension — 0.3 ml once daily for 5 days, with food.", 50, d.y, { width: 500 });

  h(d, "NOTES");
  d.font("Helvetica").fontSize(9).text(
    "Rest and lead exercise only for 7 days. Recheck 14/08/2026 or sooner if lameness worsens.",
    50, d.y, { width: 500 }
  );

  h(d, "ACCOUNT");
  const ty = d.y;
  d.font("Helvetica-Bold").fontSize(10).text("Total paid", 50, ty, { lineBreak: false });
  d.text("£142.60", 470, ty, { width: 80, align: "right", lineBreak: false });

  d.end();
  await done;
}

// ------------------------------------------------------------ F4: not a vet report
{
  const [d, done] = doc("f4-hardware-receipt.pdf");
  d.font("Helvetica-Bold").fontSize(16).text("Porter Square Hardware");
  d.font("Helvetica").fontSize(9).fillColor("#555555");
  d.text("1899 Massachusetts Ave, Cambridge MA 02140");
  d.fillColor("#000000");
  rule(d);
  d.font("Helvetica").fontSize(10);
  d.text("Receipt #  44821");
  d.text("08/14/2026  14:22");
  d.moveDown(1);
  const items = [
    ["3/4 in. copper elbow x 4", "11.96"],
    ["Teflon tape", "2.49"],
    ["Sandpaper assortment pack", "7.99"],
    ["LED bulb, 60W equivalent, 2-pack", "12.98"],
    ["Wood glue, 8 oz", "8.49"],
  ];
  for (const [desc, amt] of items) {
    const y = d.y;
    d.text(desc, 50, y, { width: 380, lineBreak: false });
    d.text("$" + amt, 470, y, { width: 80, align: "right", lineBreak: false });
    d.y = y;
    d.moveDown(1);
  }
  rule(d);
  const ty = d.y;
  d.font("Helvetica-Bold").fontSize(11).text("TOTAL", 50, ty, { lineBreak: false });
  d.text("$47.32", 470, ty, { width: 80, align: "right", lineBreak: false });
  d.moveDown(2);
  d.font("Helvetica").fontSize(9).text("Returns accepted within 30 days with receipt. Thank you!");
  d.end();
  await done;
}

console.log("wrote PDFs to", OUT);
