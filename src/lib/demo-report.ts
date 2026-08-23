import type { ExtractedReport } from "@/lib/extraction";

/**
 * A realistic extraction result, used for the "Try a sample report" path.
 *
 * This exists so the full upload -> review -> apply flow can be demonstrated
 * without an ANTHROPIC_API_KEY and without spending tokens. It is clearly
 * labelled as a sample everywhere it surfaces — it must never be presented as
 * something the model actually read.
 */
export const SAMPLE_REPORT: ExtractedReport = {
  pet: {
    name: "Mochi",
    species: "dog",
    breed: "Shiba Inu",
    sex: "female",
    birth_date: "2021-04-18",
    microchip_id: "985141002317744",
  },
  clinic_name: "Cambridge Veterinary Associates",
  visit_date: "2026-08-14",
  reason: "Annual wellness exam and vaccination",
  diagnosis: "Healthy. Mild dental calculus, grade 1.",
  cost_usd: 284.5,
  weight_kg: 9.4,
  vaccinations: [
    {
      name: "Rabies (3-year)",
      administered_on: "2026-08-14",
      due_on: "2029-08-14",
      lot_number: "RB-4471902",
    },
    {
      name: "DHPP",
      administered_on: "2026-08-14",
      due_on: "2027-08-14",
      lot_number: "DH-8820134",
    },
    {
      name: "Leptospirosis",
      administered_on: "2026-08-14",
      due_on: "2026-09-11",
      lot_number: "LP-2204418",
    },
  ],
  medications: [
    {
      name: "Simparica Trio",
      dosage: "1 chewable (10-20 kg)",
      frequency: "Once monthly",
      start_date: "2026-08-14",
      end_date: null,
    },
  ],
  notes:
    "Dental cleaning recommended within 6 months. Owner advised to begin at-home brushing. Weight stable since last visit.",
  additional_fields: [
    {
      label: "Body condition score",
      value: "5",
      unit: "/9",
      value_type: "number",
      recorded_on: "2026-08-14",
    },
    {
      label: "Dental grade",
      value: "1",
      unit: null,
      value_type: "number",
      recorded_on: "2026-08-14",
    },
    {
      label: "Heartworm antigen test",
      value: "negative",
      unit: null,
      value_type: "boolean",
      recorded_on: "2026-08-14",
    },
  ],
  confidence: "high",
  unreadable: false,
};
