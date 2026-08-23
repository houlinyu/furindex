"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { JournalCategory } from "@/lib/types";

const CATEGORIES: JournalCategory[] = [
  "symptom", "behaviour", "mood", "appetite", "energy", "other",
];

/** Fields echoed back on a validation error — see JournalFormState.values. */
const KEEP = ["occurred_on", "category", "title", "body", "severity"];

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

  const today = new Date().toISOString().slice(0, 10);
  const occurredOn = str(formData, "occurred_on") ?? today;
  if (occurredOn > today) {
    return { error: "You can't log something that hasn't happened yet.", values: keep() };
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
