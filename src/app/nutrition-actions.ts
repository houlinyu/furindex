"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FOOD_TYPES, FOOD_UNITS } from "@/lib/types";

/**
 * Same contract as RecordFormState in @/app/actions: these RETURN errors and
 * never throw. A thrown error becomes a full-page "Application error" and the
 * owner loses what they typed — three separate crash bugs in this codebase
 * were exactly that.
 */
export type NutritionState = { error?: string; ok?: boolean };

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function checked(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

function enumValue<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

const today = () => new Date().toISOString().slice(0, 10);

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * numeric(8,2) with a CHECK behind it. Without the bound here the owner gets a
 * raw "numeric field overflow" from Postgres instead of a sentence.
 */
function amount(
  raw: string | null,
  label: string
): { value: number | null } | { error: string } {
  if (!raw) return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: `${label} isn't a number.` };
  if (n <= 0) return { error: `${label} must be more than zero.` };
  if (n >= 100_000) return { error: `${label} looks wrong — the limit is 99,999.99.` };
  return { value: Math.round(n * 100) / 100 };
}

/**
 * Setting a new diet SUPERSEDES the old one; it never deletes it. When a food
 * change is the suspect in a skin or gut problem, the dates of the previous
 * diet are the whole investigation.
 */
export async function setFeedingPlan(
  _prev: NutritionState,
  formData: FormData
): Promise<NutritionState> {
  const { supabase, user } = await requireUser();

  const petId = text(formData, "pet_id");
  if (!petId) return { error: "Missing pet." };

  const brand = text(formData, "food_brand");
  const product = text(formData, "food_product");
  if (!brand && !product) {
    return { error: "Name the food — a brand, a product, or both." };
  }

  const startedOn = text(formData, "started_on") ?? today();
  const endedOn = text(formData, "ended_on");
  if (endedOn && endedOn < startedOn) {
    return { error: "The end date can't be before the start date." };
  }

  const per = amount(text(formData, "amount_per_meal"), "The amount per meal");
  if ("error" in per) return { error: per.error };

  const mealsRaw = text(formData, "meals_per_day") ?? "2";
  const meals = Number(mealsRaw);
  if (!Number.isInteger(meals) || meals < 1 || meals > 6) {
    return { error: "Meals per day has to be a whole number from 1 to 6." };
  }

  const calRaw = text(formData, "calories_per_day");
  let calories: number | null = null;
  if (calRaw) {
    const n = Number(calRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return { error: "Calories per day must be a whole number above zero." };
    }
    if (n >= 20_000) return { error: "That calorie figure looks wrong — the limit is 19,999." };
    calories = n;
  }

  // A plan with an end date is history being backfilled, not the current diet.
  const isCurrent = !endedOn;

  const { data: inserted, error } = await supabase
    .from("feeding_plans")
    .insert({
      pet_id: petId,
      owner_id: user.id,
      food_brand: brand,
      food_product: product,
      food_type: enumValue(text(formData, "food_type"), FOOD_TYPES, "dry"),
      amount_per_meal: per.value,
      amount_unit: enumValue(text(formData, "amount_unit"), FOOD_UNITS, "g"),
      meals_per_day: meals,
      calories_per_day: calories,
      notes: text(formData, "notes"),
      is_current: isCurrent,
      started_on: startedOn,
      ended_on: endedOn,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Close the old plans only AFTER the new one exists. The other order leaves a
  // pet with no current diet if the insert fails; this order can at worst leave
  // two marked current, which the UI resolves by start date.
  if (isCurrent) {
    const { data: superseded } = await supabase
      .from("feeding_plans")
      .select("id, started_on")
      .eq("pet_id", petId)
      .eq("is_current", true)
      .neq("id", inserted.id);

    for (const plan of superseded ?? []) {
      // A backdated new plan would otherwise close an older one before it began,
      // which the ended_on >= started_on CHECK rejects.
      const closedOn = startedOn < plan.started_on ? plan.started_on : startedOn;
      await supabase
        .from("feeding_plans")
        .update({ is_current: false, ended_on: closedOn })
        .eq("id", plan.id);
    }
  }

  revalidatePath(`/pets/${petId}`);
  return { ok: true };
}

/** Stops a diet without starting a replacement — the row stays as history. */
export async function endFeedingPlan(
  _prev: NutritionState,
  formData: FormData
): Promise<NutritionState> {
  const { supabase } = await requireUser();

  const petId = text(formData, "pet_id");
  const planId = text(formData, "plan_id");
  if (!petId || !planId) return { error: "Missing plan." };

  const { data: plan } = await supabase
    .from("feeding_plans")
    .select("id, started_on")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return { error: "That plan no longer exists." };

  const requested = text(formData, "ended_on") ?? today();
  if (requested < plan.started_on) {
    return { error: "The end date can't be before the plan started." };
  }

  // RLS confines this to plans on pets the caller owns.
  const { error } = await supabase
    .from("feeding_plans")
    .update({ is_current: false, ended_on: requested })
    .eq("id", planId);
  if (error) return { error: error.message };

  revalidatePath(`/pets/${petId}`);
  return { ok: true };
}

/**
 * One meal. Kept deliberately cheap to submit: an owner logging twice a day
 * abandons anything longer, and a half-kept feeding log is worse than none.
 */
export async function logFeeding(
  _prev: NutritionState,
  formData: FormData
): Promise<NutritionState> {
  const { supabase, user } = await requireUser();

  const petId = text(formData, "pet_id");
  if (!petId) return { error: "Missing pet." };

  const skipped = checked(formData, "skipped");

  const amt = amount(text(formData, "amount"), "The amount");
  if ("error" in amt) return { error: amt.error };
  // The CHECK constraint rejects this pairing; catching it here turns a raw
  // constraint name into a sentence.
  if (skipped && amt.value !== null) {
    return { error: "A skipped meal has no amount — clear one or the other." };
  }

  // The browser sends an absolute instant, because a datetime-local value read
  // on the server would be interpreted in the SERVER's timezone and silently
  // shift every meal for anyone not sitting in it.
  let fedAt = new Date().toISOString();
  const rawFedAt = text(formData, "fed_at");
  if (rawFedAt) {
    const when = new Date(rawFedAt);
    if (Number.isNaN(when.getTime())) return { error: "That time didn't make sense." };
    // An hour of slack absorbs clock skew between the browser and the server.
    if (when.getTime() > Date.now() + 3_600_000) {
      return { error: "You can't log a meal that hasn't happened yet." };
    }
    if (when.getUTCFullYear() < 1900) return { error: "That date is too far back." };
    fedAt = when.toISOString();
  }

  const fedBy = text(formData, "fed_by");
  if (fedBy && fedBy.length > 80) {
    return { error: "Keep the name under 80 characters." };
  }

  const { error } = await supabase.from("feeding_logs").insert({
    pet_id: petId,
    owner_id: user.id,
    fed_at: fedAt,
    amount: amt.value,
    amount_unit: enumValue(text(formData, "amount_unit"), FOOD_UNITS, "g"),
    fed_by: fedBy,
    skipped,
    notes: text(formData, "notes"),
  });
  if (error) return { error: error.message };

  revalidatePath(`/pets/${petId}`);
  return { ok: true };
}
