"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { JournalCategory } from "@/lib/types";

const CATEGORIES: JournalCategory[] = [
  "symptom", "behaviour", "mood", "appetite", "energy", "other",
];

/** Fields echoed back on a validation error — see JournalFormState.values. */
const KEEP = ["occurred_on", "occurred_at", "category", "title", "body", "severity"];

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export type JournalFormState = {
  error?: string;
  /** Set on success so the client can reset the form and clear its photo. */
  ok?: boolean;
  /** Echoed back so a validation error doesn't wipe what was typed. */
  values?: Record<string, string>;
  /**
   * Set only when the row insert itself failed after a photo had already been
   * uploaded, so the client can delete the now-unreferenced object. A plain
   * validation error deliberately does NOT set this — the file is still good
   * and the owner shouldn't have to attach it twice.
   */
  orphanedPhotoPath?: string;
};

/**
 * Returns errors rather than throwing. A thrown error here becomes a full-page
 * "Application error" and the owner loses the observation they just wrote —
 * which is exactly the note they were least likely to write down twice.
 */
export async function addJournalEntry(
  _prev: JournalFormState,
  formData: FormData
): Promise<JournalFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const keep = (): Record<string, string> =>
    Object.fromEntries(KEEP.map((k) => [k, String(formData.get(k) ?? "")]));

  const petId = str(formData, "pet_id");
  if (!petId) return { error: "Missing pet.", values: keep() };

  const title = str(formData, "title");
  if (!title) return { error: "Give the entry a short title.", values: keep() };
  if (title.length > 120) {
    return { error: "Keep the title under 120 characters — details go in the notes.", values: keep() };
  }

  // The date the browser sent is the owner's LOCAL day; this process's clock is
  // UTC on the host. Those disagree for part of every day, so the guard allows a
  // day of slack — enough for every real zone (UTC-12 to UTC+14) and still tight
  // enough to catch a mistyped year. Rejecting a legitimate entry because the
  // owner lives in Auckland would be a far worse failure than accepting one
  // logged a few hours "early".
  const utcToday = new Date().toISOString().slice(0, 10);
  const utcTomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const rawDate = str(formData, "occurred_on");
  const occurredOn = rawDate ?? utcToday;
  if (occurredOn > utcTomorrow) {
    return { error: "You can't log something that hasn't happened yet.", values: keep() };
  }

  // Optional, exactly like severity: an owner who writes the note at bedtime
  // usually can't say when it happened, and a made-up clock reading would read
  // as precise evidence in a vet's hands.
  //
  // This value is the owner's local wall clock and is stored verbatim in a bare
  // `time` column. It is deliberately never combined with a date here, never
  // passed to `new Date()`, and never compared against the server's clock —
  // any of those would resolve it in the host's timezone and silently shift
  // every entry for every owner outside it. Hence also no "is that time in the
  // future?" check: this process cannot know what time it is where the owner is.
  const timeRaw = str(formData, "occurred_at");
  let occurredAt: string | null = null;
  if (timeRaw) {
    // A time hanging off no date can't be placed on the timeline at all, so it
    // is the one genuinely invalid combination. (A date with no time stays
    // perfectly valid — that is the common case.)
    if (!rawDate) {
      return { error: "Pick the date this happened before adding a time.", values: keep() };
    }
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeRaw);
    const h = m ? Number(m[1]) : NaN;
    const min = m ? Number(m[2]) : NaN;
    const sec = m?.[3] ? Number(m[3]) : 0;
    if (!m || h > 23 || min > 59 || sec > 59) {
      return { error: "Give the time as a 24-hour clock reading, or leave it blank.", values: keep() };
    }
    // Normalised so every row reads back in one shape, whatever the browser sent
    // (some send HH:MM, some HH:MM:SS).
    const pad = (n: number) => String(n).padStart(2, "0");
    occurredAt = `${pad(h)}:${pad(min)}:${pad(sec)}`;
  }

  const rawCategory = str(formData, "category") ?? "symptom";
  const category = (CATEGORIES as string[]).includes(rawCategory)
    ? (rawCategory as JournalCategory)
    : "other";

  const severityRaw = str(formData, "severity");
  let severity: number | null = null;
  if (severityRaw) {
    const n = Number(severityRaw);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { error: "Severity runs from 1 (mild) to 5 (urgent).", values: keep() };
    }
    severity = n;
  }

  // The storage policy already confines writes to <uid>/…, but the path arrives
  // from the browser, so don't trust it to point at this user's own folder.
  const photoPath = str(formData, "photo_path");
  if (photoPath && !photoPath.startsWith(`${user.id}/`)) {
    return { error: "That photo couldn't be attached — try again.", values: keep() };
  }

  const { error } = await supabase.from("journal_entries").insert({
    pet_id: petId,
    owner_id: user.id,
    occurred_on: occurredOn,
    occurred_at: occurredAt,
    category,
    title,
    body: str(formData, "body"),
    severity,
    photo_path: photoPath,
  });
  if (error) {
    return { error: error.message, values: keep(), orphanedPhotoPath: photoPath ?? undefined };
  }

  revalidatePath(`/pets/${petId}`);
  return { ok: true };
}
