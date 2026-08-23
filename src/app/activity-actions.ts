"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RecordFormState } from "@/app/actions";
import {
  ACTIVITY_FIELD_LABEL,
  ACTIVITY_FIELD_SCOPE,
  ACTIVITY_FIELD_TYPE,
  ACTIVITY_FIELD_UNIT,
  activityValueForRung,
  isActivityRungId,
  todayIso,
} from "@/lib/activity";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Log today's activity rung for one pet.
 *
 * Same contract as every other record action in this app: return {error},
 * never throw. A thrown error here becomes a full-page "Application error" for
 * what is meant to be a single tap on a pet's page — the worst possible
 * failure mode for the lowest-effort thing in the product.
 *
 * NO SCHEMA CHANGE. Activity is a field_definitions row plus custom_values
 * rows, exactly like anything a vet report produces, which is what lets it flow
 * straight into HealthSignals/TrendCard without touching the baseline code.
 */
export async function logActivity(
  _prev: RecordFormState,
  formData: FormData
): Promise<RecordFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const petId = str(formData, "pet_id");
  if (!petId) return { error: "Missing pet." };

  const rungId = str(formData, "rung");
  if (!isActivityRungId(rungId)) {
    return { error: "Pick one of the five activity steps." };
  }

  // The date is decided here, not sent by the client. A page left open past
  // midnight would otherwise post yesterday's date and quietly overwrite
  // yesterday's entry. todayIso() is UTC, matching the default on
  // custom_values.recorded_on and the date the UI was rendered with.
  const recordedOn = todayIso();
  const value = activityValueForRung(rungId);

  // ---- 1. Find or create the owner's activity field definition -------------
  // Look first, insert only if missing — the same shape applyExtraction uses.
  // An upsert here could rewrite an existing definition's field_type or unit,
  // and if this owner already has a field called "Activity level" (a vet report
  // can create one), flipping it to `number` would strand every value already
  // stored in a different column.
  const { data: found, error: lookupError } = await supabase
    .from("field_definitions")
    .select("id, field_type")
    .eq("owner_id", user.id)
    .eq("label", ACTIVITY_FIELD_LABEL)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };

  let definition = found;

  if (!definition) {
    const { data: created, error: createError } = await supabase
      .from("field_definitions")
      .insert({
        owner_id: user.id,
        label: ACTIVITY_FIELD_LABEL,
        field_type: ACTIVITY_FIELD_TYPE,
        unit: ACTIVITY_FIELD_UNIT,
        scope: ACTIVITY_FIELD_SCOPE,
      })
      .select("id, field_type")
      .single();

    if (createError || !created) {
      // Two taps at once can both miss the lookup and race on the
      // unique (owner_id, label) index. That's a legitimate outcome, not a
      // failure — re-read the row the winner created instead of erroring.
      const { data: retry } = await supabase
        .from("field_definitions")
        .select("id, field_type")
        .eq("owner_id", user.id)
        .eq("label", ACTIVITY_FIELD_LABEL)
        .maybeSingle();
      if (!retry) return { error: createError?.message ?? "Couldn't set up activity logging." };
      definition = retry;
    } else {
      definition = created;
    }
  }

  // The definition may pre-date this feature and hold text or dates. Writing a
  // number into it would break the one-value-only constraint's pairing with the
  // declared type and make the existing history unreadable, so stop and say so.
  if (definition.field_type !== ACTIVITY_FIELD_TYPE) {
    return {
      error:
        `You already have a field called "${ACTIVITY_FIELD_LABEL}" that isn't numeric, ` +
        `so activity can't be stored under it. Rename that field and try again.`,
    };
  }

  // ---- 2. One entry per pet per day ---------------------------------------
  // custom_values has no unique constraint we could upsert against (and adding
  // one would be a schema change), so: update first, insert only if nothing was
  // there. Doing it in that order also means a pre-existing duplicate pair for
  // the same day gets corrected together rather than gaining a third row.
  //
  // The other value columns are cleared explicitly because the table's
  // one_value_only CHECK allows exactly one populated column, and document_id
  // is dropped because this value is now hand-entered, not from a report.
  const { data: updated, error: updateError } = await supabase
    .from("custom_values")
    .update({
      value_number: value,
      value_text: null,
      value_date: null,
      value_bool: null,
      document_id: null,
    })
    .eq("pet_id", petId)
    .eq("definition_id", definition.id)
    .eq("recorded_on", recordedOn)
    .select("id");
  if (updateError) return { error: updateError.message };

  if (!updated || updated.length === 0) {
    // RLS on custom_values requires owner_id = auth.uid() AND owns_pet(pet_id),
    // so a pet_id belonging to somebody else fails here rather than needing its
    // own ownership check.
    const { error: insertError } = await supabase.from("custom_values").insert({
      owner_id: user.id,
      pet_id: petId,
      definition_id: definition.id,
      recorded_on: recordedOn,
      value_number: value,
    });
    if (insertError) return { error: insertError.message };
  }

  revalidatePath(`/pets/${petId}`);
  return { ok: true };
}
