"use server";

/**
 * Saves the whole vaccines & preventive-care block in one submit.
 *
 * ── THE THREE HOUSE RULES, ALL OF WHICH THIS FILE OBEYS ────────────────────
 * 1. Every path RETURNS `{ error }`. Nothing here throws. A thrown server
 *    action is a full-page "Application error" and the owner loses a form they
 *    just spent two minutes filling in off a paper vaccination card, which is
 *    about the most expensive input in the app to lose. Even the branches that
 *    cannot happen end in a returned object.
 * 2. The form that posts here uses useActionState and disables while pending —
 *    see VaccineBlock. This action is additionally idempotent at the database
 *    level (two unique indexes), because "the button was disabled" is a promise
 *    the client makes and the server should not rely on.
 * 3. Only async functions are exported. The vaccine table, the labels and the
 *    date maths all live in src/lib/vaccines.ts, which is a plain module both
 *    this file and the client component import. `export type` is erased before
 *    the rule applies and is fine.
 *
 * ── WHAT IT WRITES ─────────────────────────────────────────────────────────
 * For each vaccine the owner marked "Yes" with a date:
 *   - a `vaccinations` row  — the medical record: this jab, this day.
 *   - a `care_reminders` row of kind 'vaccination' — the admin: poke me then.
 * Those are two different things and the schema already says so. The reminder's
 * due_on is the owner's chosen lead time BEFORE the real due date; the real due
 * date lives on the vaccination row and in the reminder's note.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 * It does not decide anything medical. Every interval it uses arrived in the
 * form from a field the owner could edit, pre-filled from a documented default
 * in src/lib/vaccines.ts. If the owner changed 12 to 36, this writes 36 without
 * an opinion. The one judgement it makes is refusing dates that are impossible
 * rather than merely unusual.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, parseDate } from "@/lib/reminders";
import {
  DEFAULT_LEAD,
  isReminderLead,
  nextDueFrom,
  reminderDateFor,
  reminderNoteFor,
  reminderTitleFor,
  vaccinesFor,
  type AppliedAnswer,
  type ReminderLead,
  type VaccineDef,
} from "@/lib/vaccines";
import type { CareInterval, Pet } from "@/lib/types";

/**
 * Same contract as RecordFormState in @/app/actions and ReminderState in
 * @/app/reminder-actions: an error is a sentence, not an exception.
 *
 * `saved` and `scheduled` are counts, so the form can say what actually
 * happened instead of a bare "Saved" that leaves the owner wondering whether
 * the three vaccines they marked "not sure" were silently recorded as given.
 */
export type VaccineBlockState = {
  error?: string;
  ok?: boolean;
  saved?: number;
  scheduled?: number;
};

// ------------------------------------------------------------- form utils --

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function answer(fd: FormData, key: string): AppliedAnswer | null {
  const v = text(fd, `applied__${key}`);
  return v === "yes" || v === "no" || v === "unsure" ? v : null;
}

/**
 * The server's local date, overridden by the browser's when the browser sends
 * one that is within a day of it. Lifted from the same reasoning as
 * resolveToday in reminder-actions: the owner's calendar is the one that
 * matters and only the browser knows it, but a clock more than a day out is a
 * broken or hostile clock rather than a timezone.
 */
function resolveToday(fd: FormData): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const serverToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const claimed = text(fd, "today");
  if (!claimed || !parseDate(claimed)) return serverToday;
  const drift = daysBetween(serverToday, claimed);
  return drift !== null && Math.abs(drift) <= 1 ? claimed : serverToday;
}

/**
 * repeat_interval for a vaccine reminder.
 *
 * 'annual' ONLY when the interval genuinely is twelve months. Everything else
 * gets 'none', because the care_interval enum has no three-year value and
 * writing 'annual' onto a three-year vaccine would mean that ticking it off
 * rescheduled it a year out — the app quietly inventing a schedule for a
 * medical thing, which is the exact failure this whole feature is written to
 * avoid. The real number is stored in interval_months either way; see the
 * schema comment on that column.
 */
function repeatIntervalFor(months: number): CareInterval {
  return months === 12 ? "annual" : "none";
}

/** Postgres unique-violation. Two submits raced; the row exists; that is success. */
function isDuplicate(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

/**
 * "This branch is deployed and its migration is not."
 *
 * Not a hypothetical. The team shares one Supabase project and applies
 * supabase/schema.sql by hand, so there is always a window — hours, sometimes a
 * day — where this code is live and `vaccinations.vaccine_key` is not. Postgres
 * answers with 42703 and PostgREST with PGRST204/PGRST205, and the raw strings
 * ("column vaccinations.vaccine_key does not exist") would reach an owner who
 * has just typed five dates off a paper card and can do precisely nothing with
 * that sentence.
 *
 * So it is translated into something addressed to the person who can fix it.
 * Same handling as loadOnboarding in the onboarding branch, for the same reason.
 */
const MISSING_SCHEMA = new Set(["42703", "PGRST204", "PGRST205"]);

function schemaError(err: { code?: string; message?: string } | null): string | null {
  if (!err?.code || !MISSING_SCHEMA.has(err.code)) return null;
  return "This build needs supabase/schema.sql applying to the database before the vaccine block can save — the new columns aren't there yet. Nothing you typed has been lost; try again once it's run.";
}

/** Every write goes through here, so the translation cannot be forgotten on one path. */
function saveError(err: { code?: string; message?: string } | null): string {
  return schemaError(err) ?? err?.message ?? "Couldn't save that.";
}

// -------------------------------------------------------------- per-row ----

type ParsedRow = {
  def: VaccineDef;
  applied: AppliedAnswer;
  administeredOn: string | null;
  intervalMonths: number;
  /** The next-due the owner is looking at — computed, then possibly edited. */
  dueOn: string | null;
};

/**
 * Reads one vaccine's fields out of the form and validates them.
 *
 * Returns a sentence on anything wrong. Every message names the vaccine,
 * because this form has up to five rows and "That date didn't look like a date"
 * with no subject is not an error message, it's a puzzle.
 */
function parseRow(
  fd: FormData,
  def: VaccineDef,
  today: string
): ParsedRow | { error: string } {
  const applied = answer(fd, def.key);
  if (!applied) return { error: `Answer the ${def.label} row before saving.` };

  const rawInterval = text(fd, `interval__${def.key}`);
  const intervalMonths = rawInterval === null ? def.defaultIntervalMonths : Number(rawInterval);
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > 120) {
    return { error: `The ${def.label} interval needs to be a whole number of months between 1 and 120.` };
  }

  if (applied !== "yes") {
    return { def, applied, administeredOn: null, intervalMonths, dueOn: null };
  }

  const administeredOn = text(fd, `date__${def.key}`);
  if (!administeredOn) {
    return { error: `Add the date ${def.label} was given, or change that row to “Not sure”.` };
  }
  if (!parseDate(administeredOn)) {
    return { error: `The ${def.label} date didn't look like a date.` };
  }
  if (administeredOn > today) {
    return { error: `The ${def.label} date is in the future — record it once it's happened.` };
  }
  const age = daysBetween(administeredOn, today);
  if (age !== null && age > 365 * 40) {
    return { error: `The ${def.label} date is further back than any pet has lived. Check the year.` };
  }

  // The owner may have overridden the computed next-due. Theirs wins — the
  // whole point of showing it is that they can correct it against the card in
  // their hand, which is a better source than our arithmetic.
  const editedDue = text(fd, `due__${def.key}`);
  let dueOn: string | null = null;
  if (editedDue) {
    if (!parseDate(editedDue)) {
      return { error: `The ${def.label} next-due date didn't look like a date.` };
    }
    // vaccinations has a CHECK that due_on >= administered_on. Catch it here so
    // it comes back as a sentence about the row rather than a raw constraint
    // name from Postgres.
    if (editedDue < administeredOn) {
      return { error: `The ${def.label} next-due date is before the date it was given.` };
    }
    dueOn = editedDue;
  }

  return { def, applied, administeredOn, intervalMonths, dueOn };
}

// ------------------------------------------------------------------ save ---

export async function saveVaccineBlock(
  _prev: VaccineBlockState,
  formData: FormData
): Promise<VaccineBlockState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const petId = text(formData, "pet_id");
  if (!petId) return { error: "Missing pet." };

  // Species comes from the database, never from the form. A posted species
  // would let a stale tab write a cat's FVRCP onto a dog, and the core set is
  // the one thing here that is not the owner's to choose.
  const { data: petRow, error: petError } = await supabase
    .from("pets")
    .select("id, name, species")
    .eq("id", petId)
    .maybeSingle();
  if (petError) return { error: saveError(petError) };
  if (!petRow) return { error: "That pet no longer exists." };
  const pet = petRow as Pick<Pet, "id" | "name" | "species">;

  const defs = vaccinesFor(pet.species);
  if (defs.length === 0) {
    return {
      error: "This checklist only covers dogs and cats for now — we'd rather leave it blank than invent a schedule.",
    };
  }

  const lead: ReminderLead = (() => {
    const raw = text(formData, "lead");
    return isReminderLead(raw) ? raw : DEFAULT_LEAD;
  })();

  const today = resolveToday(formData);

  // Parse and validate EVERYTHING before writing anything. A form that saves
  // two rows and then rejects the third leaves the owner unable to tell what
  // landed, and re-submitting after the fix would be their only way to find
  // out.
  const rows: ParsedRow[] = [];
  for (const def of defs) {
    const parsed = parseRow(formData, def, today);
    if ("error" in parsed) return { error: parsed.error };
    rows.push(parsed);
  }

  let saved = 0;
  let scheduled = 0;

  for (const row of rows) {
    const { def, applied, administeredOn, intervalMonths } = row;

    // ---- not given / not known -------------------------------------------
    if (applied !== "yes" || !administeredOn) {
      // Retract a reminder this block created earlier for a vaccine the owner
      // is now telling us wasn't given. Deactivated, never deleted: that is how
      // the rest of this codebase retires a reminder, and it keeps the row (and
      // any completion history on it) recoverable. Scoped to vaccine_key so a
      // hand-written reminder that happens to mention rabies is never touched.
      const { error } = await supabase
        .from("care_reminders")
        .update({ is_active: false })
        .eq("pet_id", petId)
        .eq("vaccine_key", def.key);
      if (error) return { error: saveError(error) };
      continue;
    }

    // ---- the medical record ----------------------------------------------
    // Read first, then write. The unique index on
    // (pet_id, vaccine_key, administered_on) is the real guard against a
    // double-submit; this lookup is what makes the ordinary second submit a
    // no-op rather than a caught error.
    const { data: existingVax, error: vaxLookupError } = await supabase
      .from("vaccinations")
      .select("id")
      .eq("pet_id", petId)
      .eq("vaccine_key", def.key)
      .eq("administered_on", administeredOn)
      .maybeSingle();
    if (vaxLookupError) return { error: saveError(vaxLookupError) };

    const computedDue = row.dueOn ?? nextDueFrom(administeredOn, intervalMonths);
    if (!computedDue) {
      return { error: `Couldn't work out a next date for ${def.label}. Check the interval.` };
    }

    const vaxFields = {
      pet_id: petId,
      vaccine_key: def.key,
      // The human-readable record. Stored alongside the key, not instead of it:
      // the key is for us, this is for the owner and for whoever they show it
      // to. Kept in sync on every save so a reworded label reaches old rows.
      name: def.label,
      administered_on: administeredOn,
      due_on: computedDue,
    };

    if (existingVax) {
      const { error } = await supabase
        .from("vaccinations")
        .update(vaxFields)
        .eq("id", existingVax.id);
      if (error) return { error: saveError(error) };
    } else {
      const { error } = await supabase.from("vaccinations").insert(vaxFields);
      // A duplicate here means the owner double-tapped and the first submit
      // already wrote it. That is the outcome we wanted; it is not an error to
      // show them.
      if (error && !isDuplicate(error)) return { error: saveError(error) };
      if (!error) saved += 1;
    }

    // ---- the admin ---------------------------------------------------------
    const remindOn = reminderDateFor(computedDue, lead);
    if (!remindOn) {
      return { error: `Couldn't work out a reminder date for ${def.label}.` };
    }
    const leadDays = daysBetween(remindOn, computedDue);
    if (leadDays === null) {
      return { error: `Couldn't work out a reminder date for ${def.label}.` };
    }

    const reminderFields = {
      pet_id: petId,
      owner_id: user.id,
      vaccine_key: def.key,
      title: reminderTitleFor(def),
      kind: "vaccination" as const,
      // The "poke me" date, deliberately earlier than the real due date by the
      // owner's chosen lead. The real one is recoverable as due_on +
      // reminder_lead_days and is spelled out in the note below.
      due_on: remindOn,
      repeat_interval: repeatIntervalFor(intervalMonths),
      interval_months: intervalMonths,
      reminder_lead_days: leadDays,
      notes: reminderNoteFor(def, computedDue),
      is_active: true,
    };

    const { data: existingReminder, error: remLookupError } = await supabase
      .from("care_reminders")
      .select("id")
      .eq("pet_id", petId)
      .eq("vaccine_key", def.key)
      .maybeSingle();
    if (remLookupError) return { error: saveError(remLookupError) };

    if (existingReminder) {
      const { error } = await supabase
        .from("care_reminders")
        .update(reminderFields)
        .eq("id", existingReminder.id);
      if (error) return { error: saveError(error) };
    } else {
      const { error } = await supabase.from("care_reminders").insert(reminderFields);
      if (error && !isDuplicate(error)) return { error: saveError(error) };
    }
    scheduled += 1;
  }

  revalidatePath(`/pets/${petId}`);
  revalidatePath("/dashboard");
  return { ok: true, saved, scheduled };
}
