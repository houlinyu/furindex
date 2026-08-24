"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addWellbeingNote, type WellbeingState } from "@/app/health-check-actions";
import {
  AUDIO_MIME,
  MOOD_LABEL,
  NO_CHANGES_TAG,
  SENSATION_TAGS,
  SENSATION_TAG_EMOJI,
  SENSATION_TAG_LABEL,
  isMimeRejection,
  type MediaSupport,
  type SensationTag,
} from "@/lib/health-check";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

/** Same 20 MB bucket ceiling as everything else; a spoken note is far under it. */
const MAX_VOICE_BYTES = 20 * 1024 * 1024;

/**
 * Screen 4.3 — the qualitative layer. "He's been a bit off since Tuesday" is
 * the sentence that never makes it into a health record, and it is often the
 * one the vet most wants.
 *
 * Nothing here is scored or interpreted. The slider is a description of the
 * day, not a rating of the animal, and the tags are a starting vocabulary, not
 * a symptom checklist.
 */
export default function WellbeingNoteForm({
  petId,
  support,
}: {
  petId: string;
  support: MediaSupport;
}) {
  const [state, formAction, pending] = useActionState<WellbeingState, FormData>(
    addWellbeingNote,
    {}
  );
  const formRef = useRef<HTMLFormElement>(null);
  const voiceRef = useRef<HTMLInputElement>(null);
  const [tags, setTags] = useState<SensationTag[]>([]);
  const [mood, setMood] = useState(3);
  const [moodSet, setMoodSet] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voice, setVoice] = useState<{ path: string; name: string } | null>(null);
  const errorId = useId();
  const tagsLegendId = useId();

  const busy = uploading || pending;
  const v = state.values ?? {};
  // Only offered when the bucket is known to take audio. Offering a control
  // that always fails would be worse than not offering it.
  const voiceAvailable = support.audio;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setTags([]);
      setMood(3);
      setMoodSet(false);
      setVoice(null);
      setVoiceError(null);
      if (voiceRef.current) voiceRef.current.value = "";
    }
    const orphan = state.orphanedMediaPath;
    if (orphan) {
      setVoice(null);
      createClient().storage.from("vet-reports").remove([orphan]);
    }
  }, [state]);

  /** "Nothing has changed" and "three things have changed" can't both be true. */
  function toggleTag(tag: SensationTag) {
    setTags((current) => {
      if (current.includes(tag)) return current.filter((t) => t !== tag);
      if (tag === NO_CHANGES_TAG) return [NO_CHANGES_TAG];
      return [...current.filter((t) => t !== NO_CHANGES_TAG), tag];
    });
  }

  async function submit(formData: FormData) {
    setVoiceError(null);
    const file = voiceRef.current?.files?.[0];
    let path = voice?.path ?? null;

    if (file && !path) {
      if (!AUDIO_MIME[file.type]) {
        setVoiceError("That isn't an audio file — MP3, M4A, WAV or WebM.");
        return;
      }
      if (file.size === 0) {
        setVoiceError("That file is empty.");
        return;
      }
      if (file.size > MAX_VOICE_BYTES) {
        setVoiceError(`That file is ${(file.size / 1e6).toFixed(1)} MB — the limit is 20 MB.`);
        return;
      }
      setUploading(true);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Your session expired — sign in again.");
        const key = `${user.id}/${crypto.randomUUID()}.${AUDIO_MIME[file.type]}`;
        const { error } = await supabase.storage
          .from("vet-reports")
          .upload(key, file, { contentType: file.type, upsert: false });
        if (error) {
          throw new Error(
            isMimeRejection(error.message)
              ? "Voice notes aren't switched on for this account yet — typing it works just as well."
              : error.message
          );
        }
        path = key;
        setVoice({ path: key, name: file.name });
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : "Couldn't attach that.");
        return;
      } finally {
        setUploading(false);
      }
    }

    if (path) formData.set("voice_path", path);
    // From React state rather than the serialised form — see the form-reset
    // note above.
    formData.delete("sensation_tags");
    for (const tag of tags) formData.append("sensation_tags", tag);
    formAction(formData);
  }

  return (
    <form ref={formRef} action={submit} className="card grid gap-4 p-4">
      <input type="hidden" name="pet_id" value={petId} />

      <div>
        <label htmlFor="wellbeing-body" className="mb-1 block text-sm font-medium">
          Anything feel different lately?
        </label>
        <textarea
          id="wellbeing-body"
          name="body"
          rows={3}
          maxLength={2000}
          defaultValue={v.body ?? ""}
          disabled={busy}
          placeholder="Slower on the stairs this week. Still eating fine."
          aria-describedby={
            state.error ? `wellbeing-body-hint ${errorId}` : "wellbeing-body-hint"
          }
          aria-invalid={state.error ? true : undefined}
          className={field}
        />
        <p id="wellbeing-body-hint" className="muted mt-1 text-xs">
          However you&rsquo;d say it out loud. Vague is fine — &ldquo;just not
          herself&rdquo; is a real observation and it gets a date on it here.
        </p>
      </div>

      {voiceAvailable && (
        <div>
          <label htmlFor="wellbeing-voice" className="mb-1 block text-sm font-medium">
            Or record it <span className="muted font-normal">(optional)</span>
          </label>
          <input
            ref={voiceRef}
            id="wellbeing-voice"
            type="file"
            accept={Object.keys(AUDIO_MIME).join(",")}
            disabled={busy || !!voice}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 disabled:opacity-60"
          />
          <p className="muted mt-1 text-xs">
            {voice ? `${voice.name} attached — it saves with this note.` : "A voice memo off your phone."}
          </p>
        </div>
      )}

      <fieldset>
        <legend id={tagsLegendId} className="mb-1 text-sm font-medium">
          Anything in particular? <span className="muted font-normal">(tap any, or none)</span>
        </legend>
        {/* Buttons with checkbox semantics, for the same reason as the check
            cards: React 19's post-action form reset clears a real checkbox's
            DOM state after the last render, leaving a chip that looks selected
            over an input that isn't. A button can't be reset. */}
        <div role="group" aria-labelledby={tagsLegendId} className="flex flex-wrap gap-2">
          {SENSATION_TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={busy}
                onClick={() => toggleTag(tag)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm transition disabled:opacity-60 ${
                  on
                    ? "border-brand-500 bg-brand-100 font-medium text-brand-700"
                    : "border-[var(--border)] hover:border-brand-300"
                }`}
              >
                <span aria-hidden>{SENSATION_TAG_EMOJI[tag]}</span>
                {SENSATION_TAG_LABEL[tag]}
              </button>
            );
          })}
        </div>
        <p className="muted mt-1.5 text-xs">
          A tag just says where to look later. It doesn&rsquo;t mean anything is wrong.
        </p>
      </fieldset>

      <div>
        <label htmlFor="wellbeing-mood" className="mb-1 block text-sm font-medium">
          Energy &amp; mood today
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="wellbeing-mood"
            type="range"
            min={1}
            max={5}
            step={1}
            value={mood}
            disabled={busy}
            onChange={(e) => {
              setMood(Number(e.target.value));
              setMoodSet(true);
            }}
            aria-describedby="wellbeing-mood-hint"
            className="h-11 w-full max-w-xs accent-brand-600"
          />
          {/* Only submitted once it has actually been moved. An untouched
              slider sitting at 3 would put a number nobody meant onto a chart. */}
          {moodSet && <input type="hidden" name="mood" value={mood} />}
          <span className="text-sm">
            {moodSet ? `${mood} — ${MOOD_LABEL[mood]}` : <span className="muted">Not recorded</span>}
          </span>
          {moodSet && (
            <button
              type="button"
              onClick={() => setMoodSet(false)}
              disabled={busy}
              className="muted inline-flex min-h-11 items-center text-xs underline underline-offset-2 disabled:opacity-60"
            >
              Don&rsquo;t record it
            </button>
          )}
        </div>
        <p id="wellbeing-mood-hint" className="muted mt-1 text-xs">
          1 is a flat day, 5 is bouncing off the walls. Nothing is recorded until you
          move it — and a flat day is a normal thing to have.
        </p>
      </div>

      {(state.error || voiceError) && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error ?? voiceError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {uploading ? "Attaching…" : pending ? "Saving…" : "Save this note"}
        </button>
        <span className="muted text-xs">Timestamped, so it lines up with everything else later.</span>
      </div>
    </form>
  );
}
