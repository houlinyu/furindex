"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  clearHealthCheckItem,
  saveHealthCheckItem,
  type CheckItemState,
} from "@/app/health-check-actions";
import {
  SELF_ASSESSMENTS,
  SELF_ASSESSMENT_LABEL,
  SELF_ASSESSMENT_RECAP,
  acceptFor,
  captureTypeForMime,
  extensionForMime,
  isMimeRejection,
  maxBytesFor,
  type MediaSupport,
  type PartSpec,
} from "@/lib/health-check";
import { formatTime, localToday } from "@/lib/format";
import type { CaptureType, HealthCheckItem, SelfAssessment } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

/**
 * One part of the guided check.
 *
 * Everything about this card is written to read as "write down what you can
 * see", not "we are assessing your pet". There is no scoring, no completion
 * state, and no colour that grades an answer: the three self-assessment
 * options are styled identically, because "something looks off" is a note the
 * owner made, not a warning this app raised. Skipping is free and silent —
 * a card that is never opened leaves no row and is counted nowhere.
 */
export default function HealthCheckCard({
  petId,
  spec,
  item,
  mediaUrl,
  support,
}: {
  petId: string;
  spec: PartSpec;
  item: HealthCheckItem | null;
  /** Signed URL for an already-attached file, if there is one. */
  mediaUrl: string | null;
  support: MediaSupport;
}) {
  const [state, formAction, pending] = useActionState<CheckItemState, FormData>(
    saveHealthCheckItem,
    {}
  );
  const [clearState, clearAction, clearing] = useActionState<CheckItemState, FormData>(
    clearHealthCheckItem,
    {}
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ path: string; type: CaptureType; name: string } | null>(null);
  /**
   * The object a newly attached file is about to replace, deleted once the
   * replacement row lands. A ref, not state: as state it was a dependency of
   * the cleanup effect below, so merely *choosing* a replacement re-ran that
   * effect while `state.ok` was still true from the PREVIOUS save — and deleted
   * the live file before the new one had been saved anywhere.
   */
  const replacingRef = useRef<string | null>(null);
  const [assessment, setAssessment] = useState<string>(item?.self_assessment ?? "");
  const [note, setNote] = useState<string>(item?.note ?? "");
  const errorId = useId();
  const hintId = useId();
  const legendId = useId();

  // A check belongs to the OWNER's calendar day, and only the browser knows
  // what that is — this component is server-rendered first, in the server's
  // timezone. Read once after mount; until then the field is empty and the
  // action falls back to the server's date.
  const [today, setToday] = useState("");
  useEffect(() => setToday(localToday()), []);

  const busy = uploading || pending || clearing;
  const recorded = !!item;

  // The server re-renders this card after every save, so the props are the
  // source of truth; the local copies exist only so typing feels immediate.
  useEffect(() => {
    setAssessment(item?.self_assessment ?? "");
    setNote(item?.note ?? "");
  }, [item?.id, item?.self_assessment, item?.note]);

  useEffect(() => {
    if (state.ok || clearState.ok) {
      setPendingFile(null);
      setFileError(null);
      if (fileRef.current) fileRef.current.value = "";
      // A replacement landed, so the file it replaced is now referenced by
      // nothing. Deleted from the browser because the bucket's delete policy is
      // keyed on auth.uid() and the server holds only the anon key.
      if (replacingRef.current) {
        createClient().storage.from("vet-reports").remove([replacingRef.current]);
        replacingRef.current = null;
      }
    }
    // The row never landed, or was just deleted, so nothing references the
    // object any more. Without this it sits in the bucket forever.
    const orphan = state.orphanedMediaPath ?? clearState.orphanedMediaPath;
    if (orphan) {
      setPendingFile(null);
      // The upload that failed is the orphan; the file it was going to replace
      // is still the live one, so it must NOT be queued for deletion. Missing
      // this would delete the good file on the next successful save.
      replacingRef.current = null;
      createClient().storage.from("vet-reports").remove([orphan]);
    }
    // Keyed only on the two action results, each a fresh object per resolution,
    // so this runs exactly once per completed save or removal.
  }, [state, clearState]);

  const accept = acceptFor(spec, support);
  // Only said when the bucket's configuration could actually be read. Guessing
  // and being wrong would either hide a working feature or promise a missing one.
  const clipsUnavailable =
    spec.capture !== "photo" && support.known && !support.video && !support.audio;

  /**
   * The file goes straight from the browser to storage — same route as
   * ReportUpload and the journal — so a phone clip never has to cross a Server
   * Action's body limit. Only the resulting object key is submitted.
   */
  async function submit(formData: FormData) {
    setFileError(null);
    const file = fileRef.current?.files?.[0];

    // Re-uploading on a retry would orphan the first copy, so an already
    // uploaded file is reused as-is.
    let path = pendingFile?.path ?? null;
    let type: CaptureType | null = pendingFile?.type ?? null;

    if (file && !path) {
      const captureType = captureTypeForMime(file.type);
      const ext = extensionForMime(file.type);
      if (!captureType || !ext) {
        setFileError("That file type isn't supported here — a photo or a short clip works.");
        return;
      }
      if (file.size === 0) {
        setFileError("That file is empty.");
        return;
      }
      const cap = maxBytesFor(captureType);
      if (file.size > cap) {
        setFileError(
          `That file is ${(file.size / 1e6).toFixed(1)} MB — the limit is ${Math.round(cap / 1024 / 1024)} MB. ${
            captureType === "photo" ? "Most phones can share a smaller copy." : "A shorter clip will fit."
          }`
        );
        return;
      }

      setUploading(true);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Your session expired — sign in again.");

        const key = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("vet-reports")
          .upload(key, file, { contentType: file.type, upsert: false });
        if (error) {
          // The one upload failure that is a missing feature rather than a
          // broken upload: the bucket doesn't take this kind of file yet.
          if (isMimeRejection(error.message) && captureType !== "photo") {
            // Clear the picker so the advice below is actually one click away:
            // pressing Save again now goes through with the note alone.
            if (fileRef.current) fileRef.current.value = "";
            throw new Error(
              "Clips aren't switched on for this account yet. Press Save again to keep just your note — that's the part that matters — or attach a still photo instead."
            );
          }
          throw new Error(error.message);
        }

        path = key;
        type = captureType;
        setPendingFile({ path: key, type: captureType, name: file.name });
        if (item?.media_path) replacingRef.current = item.media_path;
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "Couldn't attach that file.");
        return;
      } finally {
        setUploading(false);
      }
    }

    // Carry the existing attachment through an update that doesn't touch it.
    // Without this, changing only the assessment on a part that already has a
    // photo would save media_path = null — quietly losing the photo and
    // orphaning the object in the bucket.
    if (!path && item?.media_path && item.media_type) {
      path = item.media_path;
      type = item.media_type;
    }

    if (path && type) {
      formData.set("media_path", path);
      formData.set("media_type", type);
    }
    // Taken from React state rather than trusted from the serialised form —
    // see the form-reset note above. The note field is read from the form as
    // normal; only the radio group has the desync problem.
    formData.delete("self_assessment");
    if (assessment) formData.set("self_assessment", assessment);
    formAction(formData);
  }

  return (
    <details
      className="card group overflow-hidden"
      // Opened for you if you have already recorded this part, so a second pass
      // shows what you said last time without hunting for it.
      open={recorded}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="mt-0.5 shrink-0 text-xl leading-none">
          {spec.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{spec.label}</span>
            <span className="muted rounded-full border border-[var(--border)] px-2 py-0.5 text-[0.7rem]">
              {spec.captureLabel}
            </span>
            {spec.optional && <span className="muted text-[0.7rem]">optional</span>}
          </span>
          {/* The spec's own wording, verbatim. Always visible — it is the
              reason the card exists and the reason this isn't a photo dump. */}
          <span className="muted mt-1 block text-xs">{spec.why}</span>
          {recorded && item && (
            <span className="mt-1.5 block text-xs">
              <span
                aria-hidden
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--muted)] align-middle"
              />
              <span className="muted">
                Recorded {formatTime(item.captured_at)}
                {item.self_assessment && ` · ${SELF_ASSESSMENT_RECAP[item.self_assessment]}`}
              </span>
            </span>
          )}
        </span>
        <span
          aria-hidden
          className="muted mt-0.5 shrink-0 transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>

      <div className="border-t border-[var(--border)] px-4 py-4">
        {item && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {mediaUrl && <Preview url={mediaUrl} type={item.media_type} label={spec.label} />}
            {item.media_path && !mediaUrl && (
              <span className="muted text-xs">A file is attached to this.</span>
            )}
            {/* Its own form: a nested <form> is invalid HTML, and this is a
                different action with a different pending state. */}
            <form action={clearAction}>
              <input type="hidden" name="pet_id" value={petId} />
              <input type="hidden" name="item_id" value={item.id} />
              <button
                type="submit"
                disabled={busy}
                className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs hover:border-brand-500 hover:text-[var(--brand-text)] disabled:opacity-60"
              >
                {clearing ? "Removing…" : "Remove what's here"}
              </button>
            </form>
          </div>
        )}

        <form action={submit} className="grid gap-3">
          <input type="hidden" name="pet_id" value={petId} />
          <input type="hidden" name="part" value={spec.part} />
          <input type="hidden" name="checked_on" value={today} />

          <div>
            <label
              htmlFor={`file-${spec.part}`}
              className="mb-1 block text-sm font-medium"
            >
              {item?.media_path ? "Replace the file" : "Attach something"}{" "}
              <span className="muted font-normal">(optional)</span>
            </label>
            <input
              ref={fileRef}
              id={`file-${spec.part}`}
              type="file"
              accept={accept}
              capture={spec.capture === "photo" ? "environment" : undefined}
              disabled={busy}
              aria-describedby={hintId}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 disabled:opacity-60"
            />
            <p id={hintId} className="muted mt-1 text-xs">
              {spec.hint}
              {clipsUnavailable &&
                " Clips aren't switched on for this account yet — a still photo works, or just write it down."}
            </p>
          </div>

          <fieldset>
            <legend id={legendId} className="mb-1 text-sm font-medium">
              How did it look to you?
            </legend>
            {/*
              Buttons with radio semantics, not <input type="radio">.
              React 19 resets a form once its action resolves, and that reset
              clears a radio's DOM `checked` AFTER the last render — so a failed
              save left a chip looking selected over an input that was empty,
              and the retry saved no assessment at all. Observed in the browser,
              not theorised. A button takes no part in a form reset, so the
              React state is the only state there is, and the value reaches the
              action through the hidden input below (and again from state in
              submit(), because this one has bitten once already).
            */}
            <div
              role="radiogroup"
              aria-labelledby={legendId}
              className="flex flex-wrap gap-2"
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
                  : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const at = SELF_ASSESSMENTS.indexOf(assessment as SelfAssessment);
                const next =
                  SELF_ASSESSMENTS[
                    (((at < 0 ? 0 : at) + step) + SELF_ASSESSMENTS.length) % SELF_ASSESSMENTS.length
                  ];
                setAssessment(next);
                (e.currentTarget.querySelector(`[data-option="${next}"]`) as HTMLElement | null)?.focus();
              }}
            >
              {SELF_ASSESSMENTS.map((option, i) => {
                const selected = assessment === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    data-option={option}
                    aria-checked={selected}
                    // Roving tabindex: the group is one tab stop, arrows move inside it.
                    tabIndex={selected || (!assessment && i === 0) ? 0 : -1}
                    disabled={busy}
                    onClick={() => setAssessment(option)}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm transition disabled:opacity-60 ${
                      // All three options are styled identically when selected.
                      // No red, no green, no traffic light — this is a record of
                      // what the owner saw, not a verdict on the animal. The
                      // tick is the only difference between them, and it marks
                      // "you chose this", not "this is the good one".
                      selected
                        ? "border-brand-500 bg-brand-100 font-medium text-brand-700"
                        : "border-[var(--border)] hover:border-brand-300"
                    }`}
                  >
                    {selected && <span aria-hidden>✓</span>}
                    {SELF_ASSESSMENT_LABEL[option]}
                  </button>
                );
              })}
              {assessment && (
                <button
                  type="button"
                  onClick={() => setAssessment("")}
                  disabled={busy}
                  className="muted inline-flex min-h-11 items-center px-2 text-xs underline underline-offset-2 disabled:opacity-60"
                >
                  Clear
                </button>
              )}
            </div>
            <input type="hidden" name="self_assessment" value={assessment} />
            <p className="muted mt-1.5 text-xs">
              Your read, not a diagnosis. There&rsquo;s no wrong answer here, and
              &ldquo;not sure&rdquo; is genuinely useful to record.
            </p>
          </fieldset>

          <div>
            <label
              htmlFor={`note-${spec.part}`}
              className="mb-1 block text-sm font-medium"
            >
              Anything to add? <span className="muted font-normal">(optional)</span>
            </label>
            <textarea
              id={`note-${spec.part}`}
              name="note"
              rows={2}
              maxLength={1000}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Left ear looked pinker than the right"
              className={field}
              {...(state.error ? { "aria-invalid": true as const, "aria-describedby": errorId } : {})}
            />
          </div>

          {(state.error || fileError || clearState.error) && (
            <p id={errorId} className="text-sm text-red-600 dark:text-red-400" role="alert">
              {state.error ?? fileError ?? clearState.error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {uploading ? "Attaching…" : pending ? "Saving…" : recorded ? "Update" : "Save this part"}
            </button>
            <span className="muted text-xs">
              {pendingFile
                ? `${pendingFile.name} ready to save`
                : "Or leave it — skipping a part costs you nothing."}
            </span>
          </div>
        </form>
      </div>
    </details>
  );
}

/** Signed URL from a private bucket, so never next/image and never cached. */
function Preview({
  url,
  type,
  label,
}: {
  url: string;
  type: CaptureType | null;
  label: string;
}) {
  if (type === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="h-24 w-32 rounded-lg border border-[var(--border)] object-cover"
      />
    );
  }
  if (type === "audio") {
    return <audio src={url} controls className="max-w-full" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed URL from a private
    // bucket; next/image would need the host allow-listed and would re-fetch it
    // through the optimiser after the signature expires.
    <img
      src={url}
      alt={`What you attached for ${label.toLowerCase()}`}
      className="h-24 w-24 rounded-lg border border-[var(--border)] object-cover"
    />
  );
}
