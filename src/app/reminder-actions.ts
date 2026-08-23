"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  daysBetween,
  nextDueAfterCompletion,
  parseDate,
  snoozedDueDate,
} from "@/lib/reminders";
import { CARE_INTERVALS, CARE_KINDS, type CareInterval, type CareKind } from "@/lib/types";

/**
 * Same contract as RecordFormState in @/app/actions: these RETURN errors and
 * never throw. A thrown server action becomes a full-page "Application error"
 * and the owner loses what they typed — this codebase has had three separate
 * crash bugs that were exactly that, so every path below ends in a returned
 * object, including the ones that "can't happen".
 */
export type ReminderState = { error?: string; ok?: boolean };

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function enumValue<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * The server's local date. Reminders are calendar objects and every date column
 * here is a bare `date`, so this is the right granularity; the client corrects
 * for its own zone when it renders. A form may send its own `today` (the
 * browser's), which is preferred when present and sane — the owner's calendar
 * is the one that matters, and it is the browser that knows it.
 */
function resolveToday(fd: FormData): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const serverToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const claimed = text(fd, "today");
  if (!claimed || !parseDate(claimed)) return serverToday;
  // A browser clock can be wrong or hostile. More than a day either side of the
  // server's date is not a timezone, it's a bad clock, so ignore it.
  const drift = daysBetween(serverToday, claimed);
  return drift !== null && Math.abs(drift) <= 1 ? claimed : serverToday;
}

/** Dates outside this window are typos, not intentions. */
function sensibleDate(iso: string, today: string, label: string): string | null {
  const back = daysBetween(iso, today);
  if (back === null) return `${label} didn't look like a date.`;
  if (back > 365 * 20) return `${label} is too far in the past.`;
  if (back < -365 * 20) return `${label} is too far in the future.`;
  return null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Both surfaces show reminders, so both go stale on every write. */
function refresh(petId: string) {
  revalidatePath(`/pets/${petId}`);
  revalidatePath("/dashboard");
}

/**
 * Loads a reminder the caller is allowed to touch. RLS already confines this to
 * the caller's own pets; the explicit fetch exists so a stale or tampered id
 * returns a sentence instead of an update that silently affects zero rows and
 * reports success.
 */
async function loadReminder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
) {
  const { data, error } = await supabase
    .from("care_reminders")
    .select("id, pet_id, due_on, repeat_interval, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message } as const;
  if (!data) return { error: "That reminder no longer exists." } as const;
  return { reminder: data } as const;
}

// ------------------------------------------------------------------ create --

export async function createReminder(
  _prev: ReminderState,
  formData: FormData
): Promise<ReminderState> {
  const { supabase, user } = await requireUser();

  const petId = text(formData, "pet_id");
  if (!petId) return { error: "Missing pet." };

  const title = text(formData, "title");
  if (!title) return { error: "Give the reminder a name — “Flea & worm treatment”, say." };
  if (title.length > 120) return { error: "Keep the name under 120 characters." };

  const today = resolveToday(formData);
  const dueOn = text(formData, "due_on") ?? today;
  if (!parseDate(dueOn)) return { error: "That due date didn't look like a date." };
  const dateProblem = sensibleDate(dueOn, today, "The due date");
  if (dateProblem) return { error: dateProblem };

  const notes = text(formData, "notes");
  if (notes && notes.length > 500) return { error: "Keep the notes under 500 characters." };

  const { error } = await supabase.from("care_reminders").insert({
    pet_id: petId,
    owner_id: user.id,
    title,
    kind: enumValue(text(formData, "kind"), CARE_KINDS, "other" as CareKind),
    due_on: dueOn,
    repeat_interval: enumValue(
      text(formData, "repeat_interval"),
      CARE_INTERVALS,
      "none" as CareInterval
    ),
    notes,
    is_active: true,
  });
  if (error) return { error: error.message };

  refresh(petId);
  return { ok: true };
}

// ---------------------------------------------------------------- complete --

/**
 * Marks a reminder done and rolls it forward.
 *
 * The next due date is computed from the COMPLETION DATE, not from the old due
 * date. Advancing from the old date means a treatment given four days late is
 * four days late again next month and every month after — the cycle never
 * recovers, the overdue badge is permanently lit, and the owner learns to
 * ignore it. Anchoring on what actually happened resets the rhythm: treated on
 * the 8th, next one due the 8th. See nextDueAfterCompletion in @/lib/reminders.
 *
 * A one-off has nowhere to advance to, so completing it retires it. The row
 * stays, with the completion date on it, because "when did she last have that?"
 * is the question this table exists to answer.
 */
export async function completeReminder(
  _prev: ReminderState,
  formData: FormData
): Promise<ReminderState> {
  const { supabase } = await requireUser();

  const id = text(formData, "reminder_id");
  if (!id) return { error: "Missing reminder." };

  const loaded = await loadReminder(supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  const reminder = loaded.reminder;

  const today = resolveToday(formData);
  // Back-dating is the common case: the tablet went in on Saturday and the app
  // is opened on Monday. Forward-dating is not — it would advance the cycle off
  // a dose that hasn't happened.
  const completedOn = text(formData, "completed_on") ?? today;
  if (!parseDate(completedOn)) return { error: "That date didn't look like a date." };
  if (completedOn > today) {
    return { error: "You can't tick off something that hasn't happened yet." };
  }
  const dateProblem = sensibleDate(completedOn, today, "That date");
  if (dateProblem) return { error: dateProblem };

  const interval = reminder.repeat_interval as CareInterval;
  const nextDue = nextDueAfterCompletion(interval, completedOn);

  const { error } = await supabase
    .from("care_reminders")
    .update({
      last_completed_on: completedOn,
      // A one-off keeps its date as the record of when it was owed and drops
      // out of the active list; a repeating one moves on.
      due_on: nextDue ?? reminder.due_on,
      is_active: nextDue !== null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  refresh(reminder.pet_id);
  return { ok: true };
}

// ------------------------------------------------------------------ snooze --

/**
 * Pushes a reminder out without claiming it was done. `last_completed_on` is
 * deliberately untouched: a deferral is not a dose, and an app that records it
 * as one is lying to the owner in the one place they'll go looking for the
 * truth. Default is a week — long enough to be worth doing, short enough that
 * it comes back before the thing is genuinely forgotten.
 */
export async function snoozeReminder(
  _prev: ReminderState,
  formData: FormData
): Promise<ReminderState> {
  const { supabase } = await requireUser();

  const id = text(formData, "reminder_id");
  if (!id) return { error: "Missing reminder." };

  const rawDays = text(formData, "days");
  const days = rawDays === null ? 7 : Number(rawDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { error: "Pick a snooze between 1 and 365 days." };
  }

  const loaded = await loadReminder(supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  const reminder = loaded.reminder;

  const today = resolveToday(formData);
  const nextDue = snoozedDueDate(reminder.due_on, today, days) ?? addDays(today, days);
  if (!nextDue) return { error: "Couldn't work out a new date for that." };

  const { error } = await supabase
    .from("care_reminders")
    // Snoozing a retired reminder brings it back — the owner is clearly still
    // thinking about it — but it never records a completion.
    .update({ due_on: nextDue, is_active: true })
    .eq("id", id);
  if (error) return { error: error.message };

  refresh(reminder.pet_id);
  return { ok: true };
}

// -------------------------------------------------------------- deactivate --

/**
 * Retires a reminder. Not a delete: the pet outgrew the treatment, the course
 * finished, the reminder was set up twice — in every one of those cases the
 * completion history is still worth keeping, and a DELETE would take it with
 * it. Reversible by snoozing, which is the only way back and is intentional.
 */
export async function deactivateReminder(
  _prev: ReminderState,
  formData: FormData
): Promise<ReminderState> {
  const { supabase } = await requireUser();

  const id = text(formData, "reminder_id");
  if (!id) return { error: "Missing reminder." };

  const loaded = await loadReminder(supabase, id);
  if ("error" in loaded) return { error: loaded.error };
  const reminder = loaded.reminder;

  const { error } = await supabase
    .from("care_reminders")
    .update({ is_active: false })
    .eq("id", id);
  if (error) return { error: error.message };

  refresh(reminder.pet_id);
  return { ok: true };
}
