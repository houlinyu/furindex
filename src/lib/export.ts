/**
 * Data-export plumbing, shared by the JSON export (`/api/export`) and the
 * per-record-type CSV exports (`/api/export/[dataset]`).
 *
 * Two rules this file exists to enforce:
 *
 *  1. **The caller's own session, always.** Every query here runs through the
 *     request-scoped Supabase client, so row-level security is what decides
 *     which rows come back. There is deliberately no service-role path — an
 *     export endpoint holding a key that bypasses RLS is one URL-guessing bug
 *     away from handing out somebody else's pet's medical history.
 *  2. **Never materialise the whole account in memory.** Everything is read in
 *     `PAGE_SIZE` slices and pushed straight into the response stream. A user
 *     with ten years of feeding logs must not be able to OOM the server just by
 *     clicking "export".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The export helpers address tables by name at runtime, so the generated
 * `Database` generic can't narrow them. Kept to this one alias rather than
 * sprinkling casts through both route handlers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClient = SupabaseClient<any, "public", any>;

export type Row = Record<string, unknown>;

/**
 * PostgREST caps a single response anyway; 500 rows keeps each round trip small
 * enough that the stream stays responsive without making the request count silly.
 */
export const PAGE_SIZE = 500;

// ---------------------------------------------------------------- datasets --

export type Dataset = {
  /** Postgres table name. */
  table: string;
  /** Columns pulled, in the order they appear in the CSV. */
  columns: string[];
  /** True when the table has a `pet_id` and can be filtered to one pet. */
  petScoped: boolean;
  orderBy: string;
  ascending: boolean;
  /** One line for a human opening the file cold. */
  description: string;
  /** Per-column notes. Anything not listed is self-describing. */
  fields: Record<string, string>;
};

const ID_NOTE = "Internal identifier. Only useful for matching rows across files.";
const CREATED_NOTE = "When the row was entered into FurIndex (not when the event happened).";

export const DATASETS: Record<string, Dataset> = {
  pets: {
    table: "pets",
    columns: [
      "id", "name", "species", "breed", "sex", "birth_date", "microchip_id",
      "notes", "photo_url", "created_at", "updated_at",
    ],
    petScoped: false,
    orderBy: "created_at",
    ascending: true,
    description: "One row per pet on the account.",
    fields: {
      id: "Pet identifier. The `pet_id` column in every other file points here.",
      species: "One of: dog, cat, bird, rabbit, reptile, small_mammal, other.",
      sex: "One of: male, female, unknown.",
      birth_date: "Date of birth, YYYY-MM-DD. Empty when the owner never knew it.",
      microchip_id: "Microchip number as the owner typed it. Not validated or checksummed.",
      photo_url: "Path inside FurIndex's private photo storage. The image file itself is NOT part of this export.",
      created_at: CREATED_NOTE,
    },
  },

  vaccinations: {
    table: "vaccinations",
    columns: [
      "id", "pet_id", "name", "administered_on", "due_on", "vet_clinic",
      "lot_number", "notes", "created_at",
    ],
    petScoped: true,
    orderBy: "administered_on",
    ascending: false,
    description: "Vaccination history: what was given, when, and when the next dose is due.",
    fields: {
      id: ID_NOTE,
      name: "Vaccine name as entered, e.g. 'Rabies', 'DHPP'. Free text — spellings vary.",
      administered_on: "Date the dose was given, YYYY-MM-DD.",
      due_on: "Date the next dose is due, YYYY-MM-DD. Empty means no booster was recorded — it does NOT mean none is needed.",
      lot_number: "Vaccine lot/batch number from the certificate, when the owner had it.",
      created_at: CREATED_NOTE,
    },
  },

  medications: {
    table: "medications",
    columns: [
      "id", "pet_id", "name", "dosage", "frequency", "start_date", "end_date",
      "notes", "created_at",
    ],
    petScoped: true,
    orderBy: "start_date",
    ascending: false,
    description: "Medications and supplements, past and present.",
    fields: {
      id: ID_NOTE,
      dosage: "Free text as written on the label, e.g. '5 mg', 'half a tablet'. Not a parsed quantity.",
      frequency: "Free text, e.g. 'twice daily'. Not a parsed schedule.",
      start_date: "First day of the course, YYYY-MM-DD.",
      end_date: "Last day of the course, YYYY-MM-DD. EMPTY MEANS ONGOING — a course with no end date is still being given.",
      created_at: CREATED_NOTE,
    },
  },

  weight_logs: {
    table: "weight_logs",
    columns: ["id", "pet_id", "recorded_on", "weight_kg", "created_at"],
    petScoped: true,
    orderBy: "recorded_on",
    ascending: true,
    description: "Every recorded weight, oldest first.",
    fields: {
      id: ID_NOTE,
      recorded_on: "Date of the weigh-in, YYYY-MM-DD.",
      weight_kg: "Weight in KILOGRAMS. Always kg, whatever unit the owner's scale showed. Multiply by 2.20462 for pounds.",
      created_at: CREATED_NOTE,
    },
  },

  vet_visits: {
    table: "vet_visits",
    columns: [
      "id", "pet_id", "visited_on", "clinic", "reason", "diagnosis", "notes",
      "cost_cents", "created_at",
    ],
    petScoped: true,
    orderBy: "visited_on",
    ascending: false,
    description: "Clinic visits, as recorded by the owner — not the clinic's own record.",
    fields: {
      id: ID_NOTE,
      visited_on: "Date of the appointment, YYYY-MM-DD.",
      reason: "Why they went, in the owner's words.",
      diagnosis: "What the vet said, in the owner's words. Not a coded diagnosis.",
      cost_cents: "Cost in CENTS (integer). 12345 means 123.45. Currency is assumed USD throughout the app.",
      created_at: CREATED_NOTE,
    },
  },

  journal_entries: {
    table: "journal_entries",
    columns: [
      "id", "pet_id", "occurred_on", "occurred_at", "category", "title", "body",
      "severity", "photo_path", "created_at",
    ],
    petScoped: true,
    orderBy: "occurred_on",
    ascending: false,
    description: "Dated owner observations — symptoms, behaviour, mood, appetite, energy.",
    fields: {
      id: ID_NOTE,
      occurred_on: "The day being described, YYYY-MM-DD.",
      occurred_at: "Local wall-clock time, HH:MM:SS, in the OWNER'S timezone. It carries no timezone offset — do not read it as a UTC instant. Empty when the owner didn't say.",
      category: "One of: symptom, behaviour, mood, appetite, energy, other.",
      severity: "1-5, owner-rated, higher is worse. Empty when not rated. Subjective, and not comparable between owners.",
      photo_path: "Path inside FurIndex's private storage. The image file itself is NOT part of this export.",
      created_at: CREATED_NOTE,
    },
  },

  feeding_plans: {
    table: "feeding_plans",
    columns: [
      "id", "pet_id", "food_brand", "food_product", "food_type", "amount_per_meal",
      "amount_unit", "meals_per_day", "calories_per_day", "notes", "is_current",
      "started_on", "ended_on", "created_at",
    ],
    petScoped: true,
    orderBy: "started_on",
    ascending: false,
    description: "What the pet is SUPPOSED to eat. Superseded plans are kept, so this doubles as diet history.",
    fields: {
      id: ID_NOTE,
      food_type: "One of: dry, wet, raw, home_cooked, mixed, prescription.",
      amount_per_meal: "Quantity per meal, in `amount_unit`.",
      amount_unit: "One of: g, oz, cup, can, scoop. 'cup' and 'scoop' are whatever the owner's scoop is — not a standardised volume.",
      is_current: "true for the plan in force now. Exactly one plan per pet should be current.",
      started_on: "Date the plan began, YYYY-MM-DD.",
      ended_on: "Date it was superseded, YYYY-MM-DD. Empty on the current plan.",
      created_at: CREATED_NOTE,
    },
  },

  feeding_logs: {
    table: "feeding_logs",
    columns: [
      "id", "pet_id", "fed_at", "amount", "amount_unit", "fed_by", "skipped",
      "notes", "created_at",
    ],
    petScoped: true,
    orderBy: "fed_at",
    ascending: false,
    description: "What actually went in the bowl, meal by meal.",
    fields: {
      id: ID_NOTE,
      fed_at: "Timestamp of the meal, ISO 8601 WITH a timezone offset (unlike journal_entries.occurred_at).",
      skipped: "true means the meal did NOT happen — a refused or missed meal, deliberately recorded. Exclude these before summing intake.",
      fed_by: "Free text, e.g. 'me', 'dog walker'.",
      created_at: CREATED_NOTE,
    },
  },

  insurance_policies: {
    table: "insurance_policies",
    columns: [
      "id", "pet_id", "provider", "policy_number", "plan_name", "start_date",
      "end_date", "monthly_premium_cents", "deductible_cents", "reimbursement_pct",
      "annual_limit_cents", "contact_phone", "notes", "created_at",
    ],
    petScoped: true,
    orderBy: "start_date",
    ascending: false,
    description: "Insurance policies. A policy with no end date, or an end date in the future, is active.",
    fields: {
      id: "Policy identifier. `insurance_claims.policy_id` points here.",
      monthly_premium_cents: "Premium in CENTS (integer).",
      deductible_cents: "Deductible in CENTS (integer).",
      reimbursement_pct: "Reimbursement rate as a whole-number percentage, e.g. 80 means 80%.",
      annual_limit_cents: "Annual payout limit in CENTS (integer). Empty can mean unlimited OR simply unrecorded.",
      created_at: CREATED_NOTE,
    },
  },

  insurance_claims: {
    table: "insurance_claims",
    columns: [
      "id", "policy_id", "pet_id", "document_id", "claim_number", "service_date",
      "description", "amount_claimed_cents", "amount_paid_cents", "status",
      "submitted_on", "resolved_on", "notes", "created_at",
    ],
    petScoped: true,
    orderBy: "service_date",
    ascending: false,
    description: "Claims made against a policy.",
    fields: {
      id: ID_NOTE,
      policy_id: "Matches `insurance_policies.id`.",
      document_id: "Matches `documents.id` when a receipt was attached.",
      status: "One of: draft, submitted, in_review, approved, partially_paid, paid, denied.",
      amount_claimed_cents: "Amount claimed, in CENTS (integer).",
      amount_paid_cents: "Amount actually reimbursed, in CENTS (integer).",
      created_at: CREATED_NOTE,
    },
  },

  custom_values: {
    table: "custom_values",
    columns: [
      "id", "pet_id", "definition_id", "document_id", "recorded_on",
      "value_text", "value_number", "value_date", "value_bool", "created_at",
    ],
    petScoped: true,
    orderBy: "recorded_on",
    ascending: false,
    description:
      "Owner-defined measurements (the app's custom fields, including the activity ladder). " +
      "Each row holds ONE value in whichever value_* column matches its definition's type — " +
      "the other three are always empty. Join `definition_id` to field_definitions for the label and unit; " +
      "the CSV adds field_label and field_unit for you.",
    fields: {
      id: ID_NOTE,
      definition_id: "Matches `field_definitions.id`, which carries the human label, the type and the unit.",
      recorded_on: "The day the measurement applies to, YYYY-MM-DD.",
      value_number: "Populated when the field's type is 'number'. The unit lives on the definition, not here.",
      value_bool: "Populated when the field's type is 'boolean'.",
      created_at: CREATED_NOTE,
    },
  },

  documents: {
    table: "documents",
    columns: [
      "id", "pet_id", "storage_path", "filename", "mime_type", "size_bytes",
      "status", "extraction_error", "applied_at", "created_at",
    ],
    petScoped: true,
    orderBy: "created_at",
    ascending: false,
    description:
      "Uploaded vet reports and receipts — METADATA ONLY. The uploaded files themselves are not part of this " +
      "export; download them from the app while you still have access.",
    fields: {
      id: ID_NOTE,
      storage_path: "Path inside FurIndex's private document storage. Not a public URL.",
      status: "One of: uploaded, extracting, extracted, failed, applied. 'applied' means the extracted values were written into the record tables.",
      size_bytes: "File size in bytes.",
      created_at: "When the file was uploaded.",
    },
  },

  field_definitions: {
    table: "field_definitions",
    columns: ["id", "label", "field_type", "unit", "scope", "created_at"],
    petScoped: false,
    orderBy: "label",
    ascending: true,
    description:
      "The custom fields this account has defined. Account-level, not per-pet — this is the key that makes custom_values readable.",
    fields: {
      id: "Matches `custom_values.definition_id`.",
      field_type: "One of: text, number, date, boolean. Says which value_* column in custom_values is populated.",
      unit: "Unit for numeric fields, e.g. 'kg', 'steps'. Free text.",
      scope: "'pet' for a property of the animal, 'event' for something measured repeatedly over time.",
      created_at: CREATED_NOTE,
    },
  },
};

export const DATASET_NAMES = Object.keys(DATASETS);

/** Datasets that hang off a pet, in the order they're nested in the JSON export. */
export const PET_DATASETS = DATASET_NAMES.filter((n) => DATASETS[n].petScoped);

// --------------------------------------------------------------- paginate ---

/**
 * Reads one dataset in `PAGE_SIZE` slices, yielding each slice as it lands.
 *
 * Ordering is `orderBy` plus `id` as a tiebreak. Without the tiebreak, rows
 * sharing a date can shuffle between the two round trips that straddle them and
 * a row is silently duplicated into one page and dropped from another — the
 * classic offset-pagination corruption, and in an export nobody would notice.
 */
export async function* paginate(
  supabase: AnyClient,
  dataset: Dataset,
  petId?: string
): AsyncGenerator<Row[]> {
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase
      .from(dataset.table)
      .select(dataset.columns.join(","))
      .order(dataset.orderBy, { ascending: dataset.ascending, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (petId && dataset.petScoped) q = q.eq("pet_id", petId);

    const { data, error } = await q;
    if (error) throw new Error(`${dataset.table}: ${error.message}`);

    const rows = (data ?? []) as unknown as Row[];
    if (rows.length > 0) yield rows;
    // A short page is the last page. An exactly-full final page costs one more
    // empty round trip, which is cheaper than guessing.
    if (rows.length < PAGE_SIZE) return;
  }
}

// -------------------------------------------------------------------- CSV ---

/**
 * One CSV cell, RFC 4180 quoted.
 *
 * The leading-apostrophe guard is not cosmetic: a value starting with = + - @
 * is executed as a formula when the file is opened in Excel, Numbers or Sheets,
 * and these files are full of owner-typed free text. `notes` reading
 * `=HYPERLINK(...)` must arrive as characters, not as a live formula.
 */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let s =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function csvRow(values: unknown[]): string {
  // CRLF, per RFC 4180 — it's what Excel expects and every other reader accepts.
  return values.map(csvCell).join(",") + "\r\n";
}

// -------------------------------------------------------------- filenames ---

/** Safe, readable filename fragment: "Miss Bean (dog)" -> "miss-bean-dog". */
export function slug(input: string, fallback = "export"): string {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || fallback;
}

/**
 * `Content-Disposition` with both the plain and the RFC 5987 form. The plain
 * `filename=` is ASCII-only so a non-Latin pet name doesn't produce a mangled
 * header in older clients, while `filename*` carries the real thing.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** YYYY-MM-DD in UTC — stable regardless of where the server happens to run. */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ----------------------------------------------------------------- readme ---

/**
 * The header block at the top of the JSON export. An export nobody can read is
 * not portability, so this ships *inside* the file rather than in a doc page
 * that will not survive the account being closed.
 */
export function buildReadme(email: string | null | undefined) {
  return {
    what_this_is:
      "A complete export of the pet health records held for this FurIndex account. " +
      "It is yours: keep it, move it into another app, or hand it to a vet.",
    account: email ?? null,
    generated_at: new Date().toISOString(),
    format_version: 1,
    how_to_read_it: [
      "`pets` is a list. Each pet carries its own records inline under `records`.",
      "Plain dates are YYYY-MM-DD and carry no timezone.",
      "Timestamps ending in Z or an offset are ISO 8601 instants.",
      "`journal_entries.occurred_at` is the exception: a bare local wall-clock time with no offset.",
      "Every money field is named *_cents and is an integer number of cents.",
      "Every weight is in kilograms.",
      "An empty (null) field means 'not recorded'. It never means zero, and it never means 'no'.",
    ],
    not_included: [
      "Uploaded files — vet reports, receipts, pet photos, journal photos. Only their metadata is here. Download the originals from the app separately.",
      "Anything belonging to another account.",
    ],
    csv_alternative:
      "The same data is available one file per record type as CSV, for spreadsheets: " +
      DATASET_NAMES.map((n) => `/api/export/${n}`).join(", ") +
      ". Add ?pet=<pet id> to any of them to scope it to a single pet.",
    tables: Object.fromEntries(
      DATASET_NAMES.map((name) => [
        name,
        { description: DATASETS[name].description, fields: DATASETS[name].fields },
      ])
    ),
  };
}
