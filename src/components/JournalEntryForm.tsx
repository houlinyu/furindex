"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addJournalEntry, type JournalFormState } from "@/app/journal-actions";
import { localNowTime, localToday } from "@/lib/format";
import { JOURNAL_CATEGORY_EMOJI, JOURNAL_CATEGORY_LABEL, type JournalCategory } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

const CATEGORIES: JournalCategory[] = [
  "symptom", "behaviour", "mood", "appetite", "energy", "other",
];

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const ACCEPT = Object.keys(EXT).join(",");
// Well under the bucket's 20 MB ceiling: this is a thumbnail beside a one-line
// note, not a document anything reads.
const MAX_BYTES = 10 * 1024 * 1024;

const SEVERITY_HINT: Record<string, string> = {
  "": "Leave blank if it wasn't worth rating",
  "1": "1 — barely noticeable",
  "2": "2 — mild",
  "3": "3 — worth watching",
  "4": "4 — bad",
  "5": "5 — urgent",
};

export default function JournalEntryForm({ petId }: { petId: string }) {
  const [state, formAction, pending] = useActionState<JournalFormState, FormData>(
    addJournalEntry,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ path: string; name: string } | null>(null);
  const [severity, setSeverity] = useState("");

  const v = state.values ?? {};
  const busy = uploading || pending;

  // Date and time are controlled, and both start EMPTY rather than at "now".
  // This component is server-rendered first, and the server's clock is in the
  // server's timezone — deriving "today" or "now" during render would both
  // mismatch on hydration and, worse, show the wrong day to any owner who
  // doesn't live where the app is deployed. So the real clock is read once,
  // on the client, after mount.
  const [today, setToday] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  // Once the owner types or clears a time, changing the date must not overwrite
  // their choice — the convenience default is only for a form they haven't
  // touched yet.
  const [timeTouched, setTimeTouched] = useState(false);

  useEffect(() => {
    const t = localToday();
    setToday(t);
    setDate(t);
    setTime(localNowTime());
  }, []);

  /** Prefill the time for today, blank it for any other day — an observation
   *  recalled from last Tuesday has no defensible clock reading. */
  function pickDate(next: string) {
    setDate(next);
    if (timeTouched) return;
    setTime(next && next === today ? localNowTime() : "");
  }

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setPhoto(null);
      setSeverity("");
      setPhotoError(null);
      // reset() doesn't touch controlled inputs, so put the date/time defaults
      // back by hand for the next entry.
      const t = localToday();
      setToday(t);
      setDate(t);
      setTime(localNowTime());
      setTimeTouched(false);
    }
    // The row never landed, so nothing references the object any more. Without
    // this it sits in the bucket forever, counting against storage and visible
    // to nothing.
    const orphan = state.orphanedPhotoPath;
    if (orphan) {
      setPhoto(null);
      createClient().storage.from("vet-reports").remove([orphan]);
    }
  }, [state]);

  /** Picking the wrong photo is common; the upload already happened, so undoing
   *  it means deleting the object, not just clearing the input. */
  function discardPhoto(path: string) {
    setPhoto(null);
    setPhotoError(null);
    if (fileRef.current) fileRef.current.value = "";
    createClient().storage.from("vet-reports").remove([path]);
  }

  /**
   * The photo goes straight from the browser to storage — same path as
   * ReportUpload — so a large image never has to cross a Server Action's body
   * limit. Only the resulting object key is submitted with the form.
   */
  async function submit(formData: FormData) {
    setPhotoError(null);
    const file = fileRef.current?.files?.[0];

    // Re-uploading on a retry would leave the first copy orphaned, so an
    // already-uploaded photo is reused as-is.
    let path = photo?.path ?? null;

    if (file && !path) {
      if (!EXT[file.type]) {
        setPhotoError("Attach a photo (PNG, JPG or WebP).");
        return;
      }
      if (file.size === 0) {
        setPhotoError("That file is empty.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setPhotoError(`That photo is ${(file.size / 1e6).toFixed(1)} MB — the limit is 10 MB.`);
        return;
      }

      setUploading(true);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Your session expired — sign in again.");

        const key = `${user.id}/${crypto.randomUUID()}.${EXT[file.type]}`;
        const { error } = await supabase.storage
          .from("vet-reports")
          .upload(key, file, { contentType: file.type, upsert: false });
        if (error) throw new Error(error.message);

        path = key;
        setPhoto({ path: key, name: file.name });
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : "Couldn't attach that photo.");
        return;
      } finally {
        setUploading(false);
      }
    }

    if (path) formData.set("photo_path", path);
    formAction(formData);
  }

  return (
    <form ref={formRef} action={submit} className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
      <input type="hidden" name="pet_id" value={petId} />

      <div className="sm:col-span-2">
        <label htmlFor="journal-title" className="mb-1 block text-sm font-medium">
          What did you notice? <span className="text-red-500">*</span>
        </label>
        <input
          id="journal-title"
          name="title"
          required
          maxLength={120}
          placeholder="Off her food again"
          defaultValue={v.title ?? ""}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="journal-category" className="mb-1 block text-sm font-medium">
          Category
        </label>
        <select
          id="journal-category"
          name="category"
          defaultValue={v.category || "symptom"}
          className={field}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {JOURNAL_CATEGORY_EMOJI[c]} {JOURNAL_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="journal-date" className="mb-1 block text-sm font-medium">
          When
        </label>
        <input
          id="journal-date"
          name="occurred_on"
          type="date"
          max={today || undefined}
          value={date}
          onChange={(e) => pickDate(e.target.value)}
          className={field}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="journal-time" className="mb-1 block text-sm font-medium">
          Time <span className="muted font-normal">(optional)</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="journal-time"
            name="occurred_at"
            type="time"
            value={time}
            onChange={(e) => {
              setTimeTouched(true);
              setTime(e.target.value);
            }}
            aria-describedby="journal-time-hint"
            className={`${field} max-w-[10rem]`}
          />
          {time && (
            <button
              type="button"
              onClick={() => {
                setTimeTouched(true);
                setTime("");
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium hover:border-brand-500 hover:text-brand-600"
            >
              Clear time
            </button>
          )}
        </div>
        <p id="journal-time-hint" className="muted mt-1 text-xs">
          Leave it blank if you&rsquo;re not sure — a guessed time reads as a fact
          later. When you do know, &ldquo;3am&rdquo; and &ldquo;after dinner&rdquo; are
          different stories.
        </p>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="journal-severity" className="mb-1 block text-sm font-medium">
          Severity
        </label>
        <select
          id="journal-severity"
          name="severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          aria-describedby="journal-severity-hint"
          className={field}
        >
          <option value="">Not rated</option>
          {["1", "2", "3", "4", "5"].map((n) => (
            <option key={n} value={n}>
              {SEVERITY_HINT[n]}
            </option>
          ))}
        </select>
        <p id="journal-severity-hint" className="muted mt-1 text-xs">
          {SEVERITY_HINT[severity]}
        </p>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="journal-body" className="mb-1 block text-sm font-medium">
          Notes
        </label>
        <textarea
          id="journal-body"
          name="body"
          rows={3}
          placeholder="Ate half her breakfast, ignored dinner. Still drinking normally."
          defaultValue={v.body ?? ""}
          className={field}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="journal-photo" className="mb-1 block text-sm font-medium">
          Photo
        </label>
        <input
          ref={fileRef}
          id="journal-photo"
          type="file"
          accept={ACCEPT}
          disabled={busy || !!photo}
          aria-describedby="journal-photo-hint"
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 disabled:opacity-60"
        />
        <p id="journal-photo-hint" className="muted mt-1 text-xs">
          {photo ? (
            <>
              {photo.name} attached — it saves with this entry.{" "}
              <button
                type="button"
                onClick={() => discardPhoto(photo.path)}
                disabled={busy}
                className="text-brand-600 underline underline-offset-2 hover:text-brand-700 disabled:opacity-60"
              >
                Remove
              </button>
            </>
          ) : (
            "Optional. A rash or a limp is easier to show than describe. PNG, JPG or WebP up to 10 MB."
          )}
        </p>
      </div>

      {(state.error || photoError) && (
        <p className="text-sm text-red-600 sm:col-span-2" role="alert">
          {state.error ?? photoError}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {uploading ? "Attaching photo…" : pending ? "Saving…" : "Add entry"}
        </button>
      </div>
    </form>
  );
}
