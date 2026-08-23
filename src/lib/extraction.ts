import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/**
 * Turns a scanned/photographed vet report into structured records.
 *
 * Nothing this returns is written to the health tables directly — the owner
 * reviews and confirms first. A model misreading "0.5 mg" as "5 mg" on a
 * medication record is exactly the kind of error that must not land silently.
 */

const DateStr = z
  .string()
  .nullable()
  .describe("ISO date YYYY-MM-DD, or null if the document does not state it");

export const ExtractedReportSchema = z.object({
  // Identity, so a report can create the pet record when none exists yet.
  pet: z.object({
    name: z.string().nullable().describe("Animal's name as printed on the report"),
    species: z
      .enum(["dog", "cat", "bird", "rabbit", "reptile", "small_mammal", "other"])
      .nullable(),
    breed: z.string().nullable(),
    sex: z.enum(["male", "female", "unknown"]).nullable(),
    birth_date: DateStr.describe("Date of birth if printed. Do not derive it from an age."),
    microchip_id: z.string().nullable(),
  }),
  clinic_name: z.string().nullable(),
  visit_date: DateStr,
  reason: z.string().nullable().describe("Presenting complaint or reason for the visit"),
  diagnosis: z.string().nullable(),
  cost_usd: z.number().nullable().describe("Total charged, in dollars"),
  weight_kg: z
    .number()
    .nullable()
    .describe("Body weight in kilograms. Convert from pounds if the report uses lb."),
  vaccinations: z.array(
    z.object({
      name: z.string().describe("Vaccine name, e.g. Rabies, DHPP, FVRCP"),
      administered_on: DateStr,
      due_on: DateStr.describe("Next-due date if stated, else null"),
      lot_number: z.string().nullable(),
    })
  ),
  medications: z.array(
    z.object({
      name: z.string(),
      dosage: z.string().nullable().describe("Verbatim, e.g. '5 mg' or '0.5 mL'"),
      frequency: z.string().nullable().describe("Verbatim, e.g. 'twice daily for 7 days'"),
      start_date: DateStr,
      end_date: DateStr,
    })
  ),
  notes: z.string().nullable().describe("Anything clinically relevant that fits nowhere else"),
  // Everything the fixed tables have no home for. These become user-defined
  // fields if the owner accepts them — the schema grows from their documents.
  additional_fields: z.array(
    z.object({
      label: z.string().describe("Short human label, e.g. 'Heartworm test', 'BCS'"),
      value: z.string().describe("The value as printed, without the unit"),
      unit: z.string().nullable().describe("e.g. 'mg/dL', '/9', '°C'"),
      value_type: z.enum(["text", "number", "date", "boolean"]),
      recorded_on: DateStr,
    })
  ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How legible and unambiguous the document was"),
  unreadable: z
    .boolean()
    .describe("True if this is not a veterinary document, or is too illegible to read"),
});

export type ExtractedReport = z.infer<typeof ExtractedReportSchema>;

const SYSTEM = `You read veterinary documents — clinic invoices, vaccination
certificates, discharge summaries, lab reports — and transcribe them into
structured records.

Rules:
- Transcribe only what the document actually says. Never infer, complete, or
  guess a value that is not printed. Absent means null, not a plausible default.
- Dosages, vaccine names and dates are transcribed verbatim. A misread dosage is
  worse than a null one.
- Convert pounds to kilograms (1 lb = 0.45359237 kg) and round to two decimals.
  Convert nothing else.
- Ambiguous or handwritten dates: if you cannot resolve the year with certainty,
  return null rather than assuming the current year.
- Set unreadable=true if the image is not a veterinary document or is too
  illegible to transcribe. Return empty arrays in that case.
- Set confidence to reflect legibility and ambiguity, not how much you found.
- species must be exactly one of: dog, cat, bird, rabbit, reptile, small_mammal,
  other. A guinea pig, hamster, ferret or rat is small_mammal. Anything you
  cannot place is other — never invent a value outside this list.
- sex must be exactly one of: male, female, unknown.
- additional_fields[].value_type must be exactly one of: text, number, date, boolean.
- confidence must be exactly one of: high, medium, low.
- Do not transcribe the owner's contact details — name, address, phone, email,
  or payment information. They are not needed and must not be stored.

On additional_fields: put anything measured or recorded that has no home in the
fields above — lab values, body condition score, temperature, test results,
dental grade. One entry per distinct measurement, labelled as the document
labels it. Do not invent a label for something the document merely implies, and
do not duplicate a value you already reported in a dedicated field.`;

const SUPPORTED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type SupportedMime = (typeof SUPPORTED_MIME)[number];

export function isSupportedMime(m: string): m is SupportedMime {
  return (SUPPORTED_MIME as readonly string[]).includes(m);
}

export async function extractReport(
  fileBytes: Uint8Array,
  mimeType: SupportedMime,
  petNameHint: string | null
): Promise<ExtractedReport> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const data = Buffer.from(fileBytes).toString("base64");

  const documentBlock: Anthropic.ContentBlockParam =
    mimeType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mimeType, data },
        };

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text: petNameHint
              ? `Transcribe this veterinary document. It was uploaded against a pet recorded here as "${petNameHint}" — the document may name a different animal, in which case report the name as printed and do not correct it.`
              : "Transcribe this veterinary document. It has not been filed against a pet yet, so read the animal's identity from the document itself.",
          },
        ],
      },
    ],
    output_config: {
      format: zodOutputFormat(ExtractedReportSchema),
      effort: "medium",
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this document.");
  }
  if (!response.parsed_output) {
    throw new Error("Could not read a structured record out of this document.");
  }
  return response.parsed_output;
}
