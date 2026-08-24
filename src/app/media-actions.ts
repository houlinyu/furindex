"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_CAPTION_LENGTH,
  MAX_TAGS,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_SECONDS,
  MEDIA_NOT_MIGRATED,
  baseMime,
  isMissingTableError,
  mediaKindForMime,
  parseTagList,
} from "@/lib/media";
import type { MediaKind } from "@/lib/types";

/**
 * Same contract as ReminderState and RecordFormState: these RETURN errors and
 * never throw. A thrown server action is a full-page "Application error" that
 * wipes the form — and here the form holds a caption an owner just spoke into
 * their phone about their sick animal, which is the single worst thing in this
 * app to make somebody type twice.
 *
 * Every export in this file is an async function, deliberately. The constants
 * and the tag/mime helpers live in @/lib/media because a "use server" module
 * that exports a const builds green and then 500s at request time — that is
 * how the dashboard went down once already.
 */
export type MediaState = {
  error?: string;
  ok?: boolean;
  /**
   * Set ONLY when the row insert failed after the file had already reached
   * storage, so the client can delete the now-unreferenced object. A plain
   * validation error deliberately does not set it: the upload is still good and
   * making somebody re-record a voice note to fix a typo in a tag would be
   * absurd.
   */
  orphanedPath?: string;
};

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Turns a PostgREST failure into something an owner can act on. The one that
 * actually happens is the missing table — the migration in supabase/schema.sql
 * hasn't been applied to this project yet — and PostgREST's own wording for it,
 * "Could not find the table 'public.pet_media' in the schema cache", tells an
 * owner nothing at all.
 */
function friendlyDbError(err: { code?: string; message: string }): string {
  if (isMissingTableError(err)) return MEDIA_NOT_MIGRATED;
  if (err.code === "23505") {
    return "That file has already been added.";
  }
  return err.message;
}

/**
 * Registers a file the BROWSER has already uploaded straight to storage.
 *
 * The bytes never pass through this action: a 50 MB video would blow the
 * Server Action body limit, and the same browser→bucket path ReportUpload and
 * the journal photo use is already the one the storage policies are written
 * for. All that arrives here is the object key plus what the owner typed.
 */
export async function registerMedia(
  _prev: MediaState,
  formData: FormData
): Promise<MediaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const storagePath = text(formData, "storage_path");
  const fail = (error: string): MediaState => ({ error, orphanedPath: storagePath ?? undefined });

  const petId = text(formData, "pet_id");
  if (!petId) return fail("Missing pet.");
  if (!storagePath) return { error: "Nothing was uploaded — pick a file or record a note first." };

  // The storage policy already confines writes to <uid>/…, but this path came
  // from the browser, so don't take its word that it points at this user's own
  // folder — otherwise a row could be made to reference somebody else's object.
  if (!storagePath.startsWith(`${user.id}/`)) {
    return { error: "That upload couldn't be attached — try again." };
  }

  const rawMime = text(formData, "mime_type");
  const mime = rawMime ? baseMime(rawMime) : null;
  const kind: MediaKind | null = mime ? mediaKindForMime(mime) : null;
  if (!mime || !kind) {
    return fail("That file type isn't supported here — photos, video clips and audio only.");
  }

  const size = Number(text(formData, "size_bytes"));
  if (!Number.isInteger(size) || size <= 0) return fail("That file is empty.");
  if (size > MEDIA_MAX_BYTES[kind]) {
    // The client checks this before uploading; this is the backstop for a
    // hand-made request, so it can be blunt rather than helpful.
    return fail(`That ${kind} is over the ${Math.round(MEDIA_MAX_BYTES[kind] / 1048576)} MB limit.`);
  }

  // Unknown length is a normal outcome, not an error: a MediaRecorder blob
  // frequently reports Infinity for its own duration and a stored 0 would read
  // as a real zero-second clip later.
  let duration: number | null = null;
  const rawDuration = text(formData, "duration_seconds");
  if (rawDuration) {
    const n = Number(rawDuration);
    const cap = MEDIA_MAX_SECONDS[kind];
    if (Number.isFinite(n) && n > 0) {
      // A tenth of a second of slack: a recorder stopped by its own timer at
      // exactly the cap routinely reports 60.04.
      if (cap != null && n > cap + 0.5) {
        return fail(`That ${kind} is ${Math.round(n)} seconds — the limit is ${cap}.`);
      }
      duration = Math.round(n * 100) / 100;
    }
  }

  const caption = text(formData, "caption");
  if (caption && caption.length > MAX_CAPTION_LENGTH) {
    return fail(`Keep the description under ${MAX_CAPTION_LENGTH} characters.`);
  }

  const tags = parseTagList(formData.get("user_tags") as string | null);

  // Same local-vs-UTC reasoning as the journal: the browser sends the OWNER's
  // calendar day and this process's clock is UTC, so allow a day of slack —
  // enough for every real zone, tight enough to catch a mistyped year.
  const utcToday = new Date().toISOString().slice(0, 10);
  const utcTomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const recordedOn = text(formData, "recorded_on") ?? utcToday;
  if (recordedOn > utcTomorrow) {
    return fail("You can't add something that hasn't happened yet.");
  }

  const { error } = await supabase.from("pet_media").insert({
    pet_id: petId,
    owner_id: user.id,
    storage_path: storagePath,
    kind,
    mime_type: mime,
    size_bytes: size,
    duration_seconds: duration,
    caption,
    user_tags: tags,
    // Never populated here. See the column comment: nothing auto-applies a
    // machine tag as fact, so the only honest value today is empty.
    ai_tags: [],
    recorded_on: recordedOn,
  });
  if (error) return fail(friendlyDbError(error));

  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/media`);
  return { ok: true };
}

/**
 * Replaces the tag set on one item. Replace rather than append: the picker
 * submits the full set it is showing, so unticking a tag has to be able to
 * remove it.
 */
export async function retagMedia(
  _prev: MediaState,
  formData: FormData
): Promise<MediaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = text(formData, "media_id");
  if (!id) return { error: "Missing item." };

  const tags = parseTagList(formData.get("user_tags") as string | null);
  if (tags.length > MAX_TAGS) return { error: `Up to ${MAX_TAGS} tags per item.` };

  // RLS already scopes the update; pet_id comes back so the right page can be
  // revalidated without trusting a hidden field for it.
  const { data, error } = await supabase
    .from("pet_media")
    .update({ user_tags: tags })
    .eq("id", id)
    .select("pet_id")
    .maybeSingle();
  if (error) return { error: friendlyDbError(error) };
  if (!data) return { error: "That item is no longer there." };

  revalidatePath(`/pets/${data.pet_id}`);
  revalidatePath(`/pets/${data.pet_id}/media`);
  return { ok: true };
}

/**
 * Edits the free-text caption. Separate from retagMedia because they are edited
 * in different places and a failed tag save must not take an owner's paragraph
 * of description down with it.
 *
 * An empty caption is a legitimate edit — clearing it stores null, it does not
 * error.
 */
export async function captionMedia(
  _prev: MediaState,
  formData: FormData
): Promise<MediaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = text(formData, "media_id");
  if (!id) return { error: "Missing item." };

  const caption = text(formData, "caption");
  if (caption && caption.length > MAX_CAPTION_LENGTH) {
    return { error: `Keep the description under ${MAX_CAPTION_LENGTH} characters.` };
  }

  const { data, error } = await supabase
    .from("pet_media")
    .update({ caption })
    .eq("id", id)
    .select("pet_id")
    .maybeSingle();
  if (error) return { error: friendlyDbError(error) };
  if (!data) return { error: "That item is no longer there." };

  revalidatePath(`/pets/${data.pet_id}`);
  revalidatePath(`/pets/${data.pet_id}/media`);
  return { ok: true };
}

/**
 * Deletes the row and then the object, in that order — the same order
 * deleteDocument() uses, and for the same reason. If the object removal fails
 * we leak a file, which is recoverable by hand. The other order leaves a row
 * pointing at a path that no longer exists and, because storage_path is unique,
 * can never be re-uploaded or repaired.
 *
 * Unlike deleteDocument this returns instead of throwing: it is called from a
 * button inside the timeline, and a throw there would take the whole page down.
 */
export async function deleteMedia(
  _prev: MediaState,
  formData: FormData
): Promise<MediaState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = text(formData, "media_id");
  if (!id) return { error: "Missing item." };

  const { data: row, error: readError } = await supabase
    .from("pet_media")
    .select("storage_path, pet_id")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { error: friendlyDbError(readError) };
  // Already gone — a double-click, or another tab. Nothing to apologise for.
  if (!row) return { ok: true };

  const { error: rowError } = await supabase.from("pet_media").delete().eq("id", id);
  if (rowError) return { error: friendlyDbError(rowError) };

  const { error: objectError } = await supabase.storage
    .from("vet-reports")
    .remove([row.storage_path]);

  revalidatePath(`/pets/${row.pet_id}`);
  revalidatePath(`/pets/${row.pet_id}/media`);

  // The record is gone either way, which is what "delete" promised. Say so
  // rather than reporting a failure that would make an owner press it again.
  if (objectError) {
    return { ok: true, error: "Removed. The stored file itself may take a moment to clear." };
  }
  return { ok: true };
}
