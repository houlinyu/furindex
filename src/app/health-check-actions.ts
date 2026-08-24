"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  HEALTH_CHECK_PART_IDS,
  SELF_ASSESSMENTS,
  isSensationTag,
  NO_CHANGES_TAG,
} from "@/lib/health-check";
import type { CaptureType, HealthCheckPart, SelfAssessment } from "@/lib/types";

/**
 * Same contract as every other action module here: these RETURN errors and
 * never throw. A thrown server action is a full-page "Application error" that
 * takes the owner's typed note with it — and the note they were least likely
 * to write down a second time is exactly the one on this screen.
 */
export type CheckItemState = {
  error?: string;
  ok?: boolean;
  /** Set when a file was already uploaded but the row never landed, so the
   *  client can delete the now-unreferenced object from the bucket. */
  orphanedMediaPath?: string;
  /** Echoed back so a validation error doesn't wipe the caption. */
  values?: Record<string, string>;
};

export type WellbeingState = {
  error?: string;
  ok?: boolean;
  orphanedMediaPath?: string;
  values?: Record<string, string>;
};

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * The check is filed against the owner's LOCAL day, which only the browser
 * knows. Anything more than a day either side of the server's date is a broken
 * or hostile clock rather than a timezone, so it is ignored — the widest real
 * offset is UTC-12 to UTC+14.
 */
function resolveCheckedOn(fd: FormData): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  const claimed = str(fd, "checked_on");
  if (!claimed || !/^\d{4}-\d{2}-\d{2}$/.test(claimed)) return serverToday;
  const drift = Math.abs(Date.parse(`${claimed}T00:00:00Z`) - Date.parse(`${serverToday}T00:00:00Z`));
  if (!Number.isFinite(drift) || drift > 86_400_000) return serverToday;
  return claimed;
}

/**
 * Records one part of the guided check.
 *
 * Everything on the card is optional individually — the only thing this refuses
 * is a completely empty save, which would put a row in the history saying
 * nothing at all. Skipping a part entirely is not this function's business:
 * a skipped part simply has no row, and nothing anywhere counts them.
 */
export async function saveHealthCheckItem(
  _prev: CheckItemState,
  formData: FormData
): Promise<CheckItemState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const keep = (): Record<string, string> => ({
    note: String(formData.get("note") ?? ""),
    self_assessment: String(formData.get("self_assessment") ?? ""),
  });

  const petId = str(formData, "pet_id");
  if (!petId) return { error: "Missing pet.", values: keep() };

  const rawPart = str(formData, "part");
  if (!rawPart || !(HEALTH_CHECK_PART_IDS as string[]).includes(rawPart)) {
    return { error: "That isn't one of the parts on the checklist.", values: keep() };
  }
  const part = rawPart as HealthCheckPart;

  const rawAssessment = str(formData, "self_assessment");
  let selfAssessment: SelfAssessment | null = null;
  if (rawAssessment) {
    if (!(SELF_ASSESSMENTS as string[]).includes(rawAssessment)) {
      return { error: "Pick one of the three options, or leave it blank.", values: keep() };
    }
    selfAssessment = rawAssessment as SelfAssessment;
  }

  const note = str(formData, "note");
  if (note && note.length > 1000) {
    return { error: "That note is very long — keep it under 1000 characters.", values: keep() };
  }

  // The storage policy already confines writes to <uid>/…, but the path arrives
  // from the browser, so it is not trusted to point at this user's own folder.
  const mediaPath = str(formData, "media_path");
  if (mediaPath && !mediaPath.startsWith(`${user.id}/`)) {
    return { error: "That file couldn't be attached — try again.", values: keep() };
  }
  const rawMediaType = str(formData, "media_type");
  const mediaType = (["photo", "video", "audio"] as string[]).includes(rawMediaType ?? "")
    ? (rawMediaType as CaptureType)
    : null;
  // The column pair has a CHECK constraint; failing it would surface as a
  // Postgres error string in the UI, so it is caught here instead.
  if ((mediaPath === null) !== (mediaType === null)) {
    return { error: "That file couldn't be attached — try again.", values: keep() };
  }

  if (!selfAssessment && !note && !mediaPath) {
    return {
      error: "Nothing to save yet — attach something, add a note, or say how it looked.",
      values: keep(),
    };
  }

  const orphan = mediaPath ?? undefined;
  const checkedOn = resolveCheckedOn(formData);

  // Finds today's check or starts it, in one round trip. The unique index on
  // (pet_id, checked_on) is what makes this safe when two cards are saved at
  // the same moment.
  const { data: check, error: checkErr } = await supabase
    .from("health_checks")
    .upsert(
      { pet_id: petId, owner_id: user.id, checked_on: checkedOn },
      { onConflict: "pet_id,checked_on" }
    )
    .select("id")
    .single();
  if (checkErr || !check) {
    return { error: checkErr?.message ?? "Couldn't start today's check.", values: keep(), orphanedMediaPath: orphan };
  }

  // Re-taking a part corrects that morning's record rather than stacking a
  // second row beside it — hence the upsert on (check_id, part).
  const { error } = await supabase.from("health_check_items").upsert(
    {
      check_id: check.id,
      pet_id: petId,
      owner_id: user.id,
      part,
      media_path: mediaPath,
      media_type: mediaType,
      captured_at: new Date().toISOString(),
      self_assessment: selfAssessment,
      note,
      // Left at the default deliberately. Nothing has reviewed this and the
      // UI says nothing about review — see the comment on AiReviewStatus.
      ai_review_status: "pending",
    },
    { onConflict: "check_id,part" }
  );
  if (error) {
    return { error: error.message, values: keep(), orphanedMediaPath: orphan };
  }

  revalidatePath(`/pets/${petId}/check`);
  revalidatePath(`/pets/${petId}`);
  return { ok: true };
}

/**
 * Removes one part from today's check — the wrong photo, or a change of mind.
 * Returns the object key so the browser can delete the file too; the server has
 * only the anon key, and the bucket's delete policy is keyed on auth.uid().
 */
export async function clearHealthCheckItem(
  _prev: CheckItemState,
  formData: FormData
): Promise<CheckItemState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const petId = str(formData, "pet_id");
  const itemId = str(formData, "item_id");
  if (!petId || !itemId) return { error: "Nothing to remove." };

  // Read the path back before deleting the row, or the object key is lost and
  // the file sits in the bucket forever with nothing referencing it.
  const { data: existing } = await supabase
    .from("health_check_items")
    .select("media_path")
    .eq("id", itemId)
    .maybeSingle();

  const { error } = await supabase.from("health_check_items").delete().eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath(`/pets/${petId}/check`);
  revalidatePath(`/pets/${petId}`);
  return { ok: true, orphanedMediaPath: existing?.media_path ?? undefined };
}

/**
 * Screen 4.3. The qualitative layer — "he's been a bit off since Tuesday" —
 * with a timestamp on it so it can later be laid beside whatever objective
 * data exists.
 */
export async function addWellbeingNote(
  _prev: WellbeingState,
  formData: FormData
): Promise<WellbeingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const keep = (): Record<string, string> => ({
    body: String(formData.get("body") ?? ""),
    mood: String(formData.get("mood") ?? ""),
  });

  const petId = str(formData, "pet_id");
  if (!petId) return { error: "Missing pet.", values: keep() };

  const body = str(formData, "body");
  if (body && body.length > 2000) {
    return { error: "That's a long one — keep it under 2000 characters.", values: keep() };
  }

  const tags = formData
    .getAll("sensation_tags")
    .filter((v): v is string => typeof v === "string");
  const unknown = tags.find((t) => !isSensationTag(t));
  if (unknown) return { error: "That isn't one of the tags.", values: keep() };
  const uniqueTags = [...new Set(tags)];
  // "Nothing has changed" and "these three things have changed" cannot both be
  // true. The form already prevents it; this is the second lock.
  if (uniqueTags.includes(NO_CHANGES_TAG) && uniqueTags.length > 1) {
    return {
      error: "“No changes noticed” can't sit alongside a change — pick one or the other.",
      values: keep(),
    };
  }

  const rawMood = str(formData, "mood");
  let mood: number | null = null;
  if (rawMood) {
    const n = Number(rawMood);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { error: "The energy slider runs from 1 to 5.", values: keep() };
    }
    mood = n;
  }

  const voicePath = str(formData, "voice_path");
  if (voicePath && !voicePath.startsWith(`${user.id}/`)) {
    return { error: "That voice note couldn't be attached — try again.", values: keep() };
  }

  if (!body && !mood && uniqueTags.length === 0) {
    return {
      error: "Write a line, tap a tag, or move the slider — anything at all.",
      values: keep(),
    };
  }

  const { error } = await supabase.from("wellbeing_notes").insert({
    pet_id: petId,
    owner_id: user.id,
    body,
    sensation_tags: uniqueTags,
    mood,
    voice_path: voicePath,
  });
  if (error) {
    return { error: error.message, values: keep(), orphanedMediaPath: voicePath ?? undefined };
  }

  revalidatePath(`/pets/${petId}/check`);
  revalidatePath(`/pets/${petId}`);
  return { ok: true };
}
