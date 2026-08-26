"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ExtractedReport } from "@/lib/extraction";
import type { FieldType, PetSex, PetSpecies } from "@/lib/types";
import { SAMPLE_REPORT } from "@/lib/demo-report";

/** What the owner accepted on the review screen. Indices refer to the arrays
 *  in documents.extracted — nothing is written that isn't listed here. */
export type ApplyPlan = {
  petId: string | null;
  createPet: {
    name: string;
    species: PetSpecies;
    breed: string | null;
    sex: PetSex;
    birth_date: string | null;
    microchip_id: string | null;
  } | null;
  vaccinations: number[];
  medications: number[];
  additionalFields: number[];
  weight: boolean;
  visit: boolean;
};

export async function registerDocument(input: {
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  petId: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The storage policy already confines writes to <uid>/…, but a client could
  // still register a path it doesn't own. Check the prefix before trusting it.
  if (!input.storagePath.startsWith(`${user.id}/`)) {
    throw new Error("Invalid storage path");
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      owner_id: user.id,
      pet_id: input.petId,
      storage_path: input.storagePath,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function applyExtraction(documentId: string, plan: ApplyPlan) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new Error("Document not found");
  // Being able to READ a document is not authority to write records from it.
  // RLS scopes the select, but once caretaker sharing exists a shared reader can
  // see an owner's upload — and a silent write filter is not a permission check.
  if (doc.owner_id !== user.id) {
    throw new Error("Only the person who uploaded this report can save it to a pet.");
  }
  if (!doc.extracted) throw new Error("This document has not been read yet");
  // Without this, a second tab (or a retry after a mid-way failure) writes the
  // whole set again — duplicate vaccinations, and a second copy of the pet.
  if (doc.applied_at || doc.status === "applied") {
    throw new Error("These records have already been saved to a pet.");
  }

  const report = doc.extracted as ExtractedReport;
  const today = new Date().toISOString().slice(0, 10);

  // ---- 1. Decide which pet these records belong to -------------------------
  let petId = plan.petId;
  if (!petId && plan.createPet) {
    const { data: created, error } = await supabase
      .from("pets")
      .insert({
        owner_id: user.id,
        name: plan.createPet.name,
        species: plan.createPet.species,
        breed: plan.createPet.breed,
        sex: plan.createPet.sex,
        birth_date:
          plan.createPet.birth_date && plan.createPet.birth_date <= today
            ? plan.createPet.birth_date
            : null,
        microchip_id: plan.createPet.microchip_id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    petId = created.id;
  }
  if (!petId) throw new Error("Choose a pet, or create one from the report");

  // ---- 2. Write only what was ticked ---------------------------------------
  const visitDate = report.visit_date ?? new Date().toISOString().slice(0, 10);

  // These are model outputs with DB CHECK constraints behind them and no way for
  // the user to correct them in the review UI. Drop the offending field rather
  // than let the whole save fail on a constraint the user cannot see.
  const clampDue = (administered: string, due: string | null) =>
    due && due >= administered ? due : null;
  const clampEnd = (start: string, end: string | null) =>
    end && end >= start ? end : null;

  // Re-filing the SAME record must not double a pet's history: a per-document
  // latch stops re-applying one document, but a user who re-uploads the same
  // certificate ("did I already add this?") would otherwise duplicate every row.
  // So skip a vaccination/medication/visit that already matches one on the pet.
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const [{ data: existingVax }, { data: existingMeds }, { data: existingVisits }] = await Promise.all([
    supabase.from("vaccinations").select("name, administered_on").eq("pet_id", petId),
    supabase.from("medications").select("name, dosage").eq("pet_id", petId),
    supabase.from("vet_visits").select("visited_on").eq("pet_id", petId),
  ]);
  const vaxKeys = new Set((existingVax ?? []).map((v) => `${norm(v.name)}|${v.administered_on ?? ""}`));
  const medKeys = new Set((existingMeds ?? []).map((m) => `${norm(m.name)}|${norm(m.dosage)}`));
  const visitDays = new Set((existingVisits ?? []).map((v) => v.visited_on));

  const vaccineRows = plan.vaccinations
    .map((i) => report.vaccinations[i])
    .filter(Boolean)
    .map((v) => {
      const administered = v.administered_on ?? visitDate;
      return {
        pet_id: petId!,
        name: v.name,
        administered_on: administered,
        due_on: clampDue(administered, v.due_on),
        vet_clinic: report.clinic_name,
        lot_number: v.lot_number,
      };
    })
    .filter((r) => {
      const k = `${norm(r.name)}|${r.administered_on}`;
      if (vaxKeys.has(k)) return false; // already on the pet — don't duplicate
      vaxKeys.add(k); // also dedup within this same batch
      return true;
    });
  if (vaccineRows.length) {
    const { error } = await supabase.from("vaccinations").insert(vaccineRows);
    if (error) throw new Error(error.message);
  }

  const medRows = plan.medications
    .map((i) => report.medications[i])
    .filter(Boolean)
    .map((m) => {
      const start = m.start_date ?? visitDate;
      return {
        pet_id: petId!,
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        start_date: start,
        end_date: clampEnd(start, m.end_date),
      };
    })
    .filter((r) => {
      const k = `${norm(r.name)}|${norm(r.dosage)}`;
      if (medKeys.has(k)) return false;
      medKeys.add(k);
      return true;
    });
  if (medRows.length) {
    const { error } = await supabase.from("medications").insert(medRows);
    if (error) throw new Error(error.message);
  }

  if (plan.weight && report.weight_kg != null && report.weight_kg > 0 && report.weight_kg < 1000) {
    const { error } = await supabase.from("weight_logs").upsert(
      { pet_id: petId, recorded_on: visitDate, weight_kg: report.weight_kg },
      { onConflict: "pet_id,recorded_on" }
    );
    if (error) throw new Error(error.message);
  }

  if (plan.visit && !visitDays.has(visitDate)) {
    const { error } = await supabase.from("vet_visits").insert({
      pet_id: petId,
      visited_on: visitDate,
      clinic: report.clinic_name,
      reason: report.reason,
      diagnosis: report.diagnosis,
      notes: report.notes,
      cost_cents:
        report.cost_usd != null && report.cost_usd >= 0
          ? Math.round(report.cost_usd * 100)
          : null,
    });
    if (error) throw new Error(error.message);
  }

  // ---- 3. Freeform values become the owner's own field definitions ---------
  for (const i of plan.additionalFields) {
    const f = report.additional_fields[i];
    if (!f) continue;

    // Look first, insert only if missing. An upsert here would let a later
    // document rewrite field_type — flipping an established `number` field to
    // `text` and stranding every earlier value in the wrong column.
    const { data: found } = await supabase
      .from("field_definitions")
      .select("id, field_type")
      .eq("owner_id", user.id)
      .eq("label", f.label)
      .maybeSingle();

    let def = found;
    if (!def) {
      const { data: created, error: defError } = await supabase
        .from("field_definitions")
        .insert({
          owner_id: user.id,
          label: f.label,
          field_type: f.value_type as FieldType,
          unit: f.unit,
          scope: "event",
        })
        .select("id, field_type")
        .single();
      if (defError) throw new Error(defError.message);
      def = created;
    }

    // Always coerce with the EXISTING type, not what this document claims.
    const value = coerceValue(f.value, def.field_type as FieldType);
    if (!value) continue; // unparseable for its type — skip rather than store junk

    const { error } = await supabase.from("custom_values").insert({
      owner_id: user.id,
      pet_id: petId,
      definition_id: def.id,
      document_id: documentId,
      recorded_on: f.recorded_on ?? visitDate,
      ...value,
    });
    if (error) throw new Error(error.message);
  }

  // Atomic: `.is("applied_at", null)` makes the latch itself the guard, and
  // `.select()` returns the affected rows. Without the row count this cannot
  // detect a write RLS silently filtered to zero — that returns no error, so the
  // earlier read-then-write version believed it had succeeded and the same
  // report could be applied over and over.
  const { data: latched, error: latchError } = await supabase
    .from("documents")
    .update({ status: "applied", pet_id: petId, applied_at: new Date().toISOString() })
    .eq("id", documentId)
    .is("applied_at", null)
    .select("id");
  if (latchError) throw new Error(latchError.message);
  if (!latched?.length) {
    throw new Error("These records have already been saved to a pet.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/pets");
  revalidatePath(`/pets/${petId}`);
  redirect(`/pets/${petId}`);
}

/** Exactly one value column gets set — the DB has a check constraint saying so. */
function coerceValue(raw: string, type: FieldType) {
  const v = raw.trim();
  if (!v) return null;

  if (type === "number") {
    const stripped = v.replace(/[^0-9.eE+-]/g, "");
    // Number("") is 0 and finite, so words vet reports actually print in numeric
    // columns — "normal", "WNL", "N/A" — used to be stored as a real 0.
    if (!stripped || !/\d/.test(stripped)) return null;
    const n = Number(stripped);
    return Number.isFinite(n) ? { value_number: n } : null;
  }
  if (type === "date") {
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { value_date: v } : null;
  }
  if (type === "boolean") {
    const t = v.toLowerCase();
    if (["true", "yes", "positive", "y", "1"].includes(t)) return { value_bool: true };
    if (["false", "no", "negative", "n", "0"].includes(t)) return { value_bool: false };
    return null;
  }
  return { value_text: v };
}

export async function deleteDocument(documentId: string) {
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, pet_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return;

  // Row first. If the object removal fails we leak a file, which is recoverable.
  // The other order leaves a row pointing at a dead path, and storage_path is
  // unique — so it can never be re-uploaded or repaired.
  const { error: rowError } = await supabase.from("documents").delete().eq("id", documentId);
  if (rowError) throw new Error(rowError.message);
  await supabase.storage.from("vet-reports").remove([doc.storage_path]);

  revalidatePath("/dashboard");
  if (doc.pet_id) revalidatePath(`/pets/${doc.pet_id}`);
}


/**
 * Seeds a pre-extracted sample document so the review -> apply flow can be shown
 * without an API key. Writes the same shape a real extraction would, so there is
 * no separate demo code path downstream.
 */
export async function createSampleDocument() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("documents")
    .insert({
      owner_id: user.id,
      pet_id: null,
      storage_path: `${user.id}/sample-${crypto.randomUUID()}.pdf`,
      filename: "SAMPLE — Cambridge Vet, annual exam.pdf",
      mime_type: "application/pdf",
      size_bytes: 148_233,
      status: "extracted",
      extracted: SAMPLE_REPORT,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  redirect(`/documents/${data.id}`);
}

/**
 * Stores an extraction the BROWSER produced (see lib/extraction-browser.ts).
 *
 * The equivalent server route writes this itself, but OCR cannot run there
 * inside the function time limit, so for photographs the reading happens on the
 * visitor's machine and only the result comes back.
 *
 * That makes `extracted` attacker-controlled in a way the server route's output
 * is not — so ownership is re-checked here rather than trusted, and the value is
 * stored exactly as the review screen will show it. Nothing here writes to a
 * pet's record: applyExtraction still requires the owner to tick each line.
 */
export async function saveBrowserExtraction(
  documentId: string,
  extracted: unknown
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired — sign in again." };

  if (!extracted || typeof extracted !== "object") {
    return { error: "Nothing readable came back from that scan." };
  }

  // Owner-only, and only while the document is still unfiled. Without the
  // status guard this could overwrite the reading of a document whose records
  // have already been applied, silently changing what the owner agreed to.
  const { data: updated, error } = await supabase
    .from("documents")
    .update({ status: "extracted", extracted, extraction_error: null })
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .neq("status", "applied")
    .select("id");

  if (error) return { error: error.message };
  if (!updated?.length) return { error: "That document is no longer waiting to be read." };
  return { ok: true };
}

/** Records that a browser-side read failed, so the page can say so. */
export async function saveBrowserExtractionError(
  documentId: string,
  message: string
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired — sign in again." };

  const { error } = await supabase
    .from("documents")
    .update({ status: "failed", extraction_error: message.slice(0, 500) })
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .neq("status", "applied");

  if (error) return { error: error.message };
  return { ok: true };
}
