"use client";

import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerMedia, type MediaState } from "@/app/media-actions";
import { localToday } from "@/lib/format";
import {
  MAX_CAPTION_LENGTH,
  MAX_TAGS,
  MEDIA_LIMIT_HINT,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_SECONDS,
  SUGGESTED_TAGS,
  acceptFor,
  baseMime,
  extForMime,
  formatBytes,
  formatDuration,
  mediaKindForMime,
  normaliseTags,
} from "@/lib/media";
import type { MediaKind } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

/**
 * The prompts, which are the whole point of this control.
 *
 * "Upload a file" is a filing-cabinet question and gets filing-cabinet answers.
 * Each of these asks for something an owner can actually picture, and the third
 * one matters most: an owner types or says "she's been going to her water bowl
 * more" and no tag vocabulary anyone could design would ever have had a
 * checkbox for that. The tags below are for finding it again later; the free
 * text and the voice note are where the information actually is.
 */
const PROMPTS: Record<MediaKind, { emoji: string; title: string; blurb: string }> = {
  photo: {
    emoji: "📷",
    title: "Add a recent photo — how does your pet usually look?",
    blurb:
      "A normal-day photo is the one that's missing later, when you're trying to work out whether something has changed.",
  },
  video: {
    emoji: "🎬",
    title: "Got a short video of a behaviour you've noticed?",
    blurb:
      "Limping, scratching, unusual energy. Ten seconds of it in front of a vet beats a paragraph describing it.",
  },
  audio: {
    emoji: "🎤",
    title: "Voice note: describe what's been going on in your own words",
    blurb:
      "No form to fill in. Say it the way you'd say it to a friend — the details you'd never have thought to tick a box for are the ones that turn out to matter.",
  },
};

type Pending = {
  file: File;
  kind: MediaKind;
  /** Seconds, or null when the browser wouldn't tell us. */
  duration: number | null;
  /** Object URL for local preview. Revoked when the item is cleared. */
  previewUrl: string;
  /** True when it came from the microphone rather than the file picker. */
  recorded: boolean;
};

/** Probes a picked video/audio file for its length. Resolves null if it can't. */
function probeDuration(file: File, kind: MediaKind, url: string): Promise<number | null> {
  if (kind === "photo") return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(kind === "video" ? "video" : "audio");
    // Some containers never fire loadedmetadata at all (a codec the browser
    // can't decode). An unknown duration must not hang the upload, so this
    // races a timeout and stores "unknown" — the caps are still enforced by
    // file size, which is always knowable.
    const done = (v: number | null) => {
      el.removeAttribute("src");
      el.load?.();
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 4000);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    };
    el.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    el.src = url;
  });
}

/** First container this browser will actually record. Chrome: webm/opus. Safari: mp4. */
function pickRecorderMime(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return undefined;
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m));
}

export default function MediaCapture({ petId }: { petId: string }) {
  const [state, formAction, saving] = useActionState<MediaState, FormData>(registerMedia, {});
  const formRef = useRef<HTMLFormElement>(null);
  const errorId = useId();

  const [kind, setKind] = useState<MediaKind>("photo");
  const [pending, setPending] = useState<Pending | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [caption, setCaption] = useState("");

  // Same reasoning as the journal form: this renders on the server first, and
  // the server's clock is in the server's timezone. Deriving "today" during
  // render would mismatch on hydration and show the wrong day to anyone who
  // doesn't live where the app is deployed. Read the real clock once, on mount.
  const [today, setToday] = useState("");
  const [recordedOn, setRecordedOn] = useState("");
  useEffect(() => {
    const t = localToday();
    setToday(t);
    setRecordedOn(t);
  }, []);

  // ------------------------------------------------------------ recording ---
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Read inside the recorder's onstop callback, which closes over stale state.
  const elapsedRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const clearPending = useCallback(() => {
    setPending((p) => {
      if (p) URL.revokeObjectURL(p.previewUrl);
      return null;
    });
  }, []);

  const stopStream = useCallback(() => {
    // Without this the browser's "recording" indicator stays lit and the mic
    // stays held open after the note is finished, which is alarming and rude.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  // Releases the microphone if the component unmounts mid-recording.
  useEffect(() => stopStream, [stopStream]);

  async function startRecording() {
    setMicError(null);
    setLocalError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicError(
        "This browser won't let a page record audio — it needs a secure (https) connection and microphone support. You can still record a note with your phone's own voice recorder and attach the file below."
      );
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setMicError(
        "This browser can't record audio in the page. Record with your phone's voice recorder and attach the file below instead."
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Distinguish "you said no" from "there is no microphone" — the fix is
      // completely different and a single generic failure message sends people
      // to the wrong one.
      const name = err instanceof DOMException ? err.name : "";
      setMicError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was blocked. Allow it for this site in your browser's address bar and try again — or attach an audio file below instead."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone found. Attach an audio file below instead."
            : "Couldn't start recording. Attach an audio file below instead."
      );
      return;
    }

    clearPending();
    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickRecorderMime();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = baseMime(rec.mimeType || mimeType || "audio/webm");
      const blob = new Blob(chunksRef.current, { type });
      stopStream();
      setRecording(false);
      if (blob.size === 0) {
        setMicError("Nothing was recorded — check the microphone and try again.");
        return;
      }
      const ext = extForMime(type) ?? "weba";
      const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type });
      if (file.size > MEDIA_MAX_BYTES.audio) {
        setMicError(
          `That recording is ${formatBytes(file.size)} — the limit is ${formatBytes(MEDIA_MAX_BYTES.audio)}.`
        );
        return;
      }
      setPending({
        file,
        kind: "audio",
        // The timer, not the blob: a MediaRecorder webm reports its own
        // duration as Infinity, and rounding that to 0 would store a lie.
        duration: elapsedRef.current > 0 ? elapsedRef.current : null,
        previewUrl: URL.createObjectURL(file),
        recorded: true,
      });
    };

    // A timeslice so a long note isn't one giant final chunk in memory.
    rec.start(1000);
    setRecording(true);
    setElapsed(0);
    elapsedRef.current = 0;
    const started = Date.now();
    tickRef.current = setInterval(() => {
      const secs = (Date.now() - started) / 1000;
      elapsedRef.current = secs;
      setElapsed(secs);
      // Hard stop at the cap rather than letting it run and rejecting it
      // afterwards — three minutes of talking thrown away at the end would be
      // unforgivable.
      if (secs >= (MEDIA_MAX_SECONDS.audio ?? 180)) stopRecording();
    }, 200);
  }

  function stopRecording() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    const rec = recorderRef.current;
    try {
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      // Already stopped by the browser (tab hidden, device unplugged). onstop
      // will not fire again, so release the mic here instead.
      stopStream();
      setRecording(false);
    }
  }

  function cancelRecording() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    const rec = recorderRef.current;
    if (rec) {
      // Drop the audio rather than turning it into a pending file.
      rec.onstop = null;
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {
        /* already stopped */
      }
    }
    chunksRef.current = [];
    stopStream();
    setRecording(false);
    setElapsed(0);
    elapsedRef.current = 0;
  }

  // ---------------------------------------------------------- file picking --
  async function handleFile(file: File, expected: MediaKind) {
    setLocalError(null);
    setMicError(null);

    const detected = mediaKindForMime(file.type);
    if (!detected) {
      setLocalError(
        `That file type isn't supported. ${MEDIA_LIMIT_HINT[expected]}`
      );
      return;
    }
    if (detected !== expected) {
      setLocalError(
        `That looks like ${detected === "photo" ? "a photo" : detected === "video" ? "a video" : "an audio file"}. Switch to the “${PROMPTS[detected].title.split("—")[0].trim()}” prompt above, or pick a different file.`
      );
      return;
    }
    if (file.size === 0) {
      setLocalError("That file is empty.");
      return;
    }
    if (file.size > MEDIA_MAX_BYTES[detected]) {
      setLocalError(
        `That ${detected === "photo" ? "photo" : detected === "video" ? "video" : "recording"} is ${formatBytes(file.size)} — the limit is ${Math.round(MEDIA_MAX_BYTES[detected] / 1048576)} MB. ${MEDIA_LIMIT_HINT[detected]}`
      );
      return;
    }

    const url = URL.createObjectURL(file);
    const duration = await probeDuration(file, detected, url);
    const cap = MEDIA_MAX_SECONDS[detected];
    if (cap != null && duration != null && duration > cap + 0.5) {
      URL.revokeObjectURL(url);
      setLocalError(
        `That clip is ${formatDuration(duration)} — the limit is ${formatDuration(cap)}. Trim it on your phone and try again.`
      );
      return;
    }

    clearPending();
    setPending({ file, kind: detected, duration, previewUrl: url, recorded: false });
  }

  // ------------------------------------------------------------------ tags --
  function addTag(raw: string) {
    const next = normaliseTags([...tags, raw]);
    if (next.length === tags.length && !tags.includes(raw.trim().toLowerCase())) {
      setLocalError(`That's the most tags one item can carry (${MAX_TAGS}).`);
      return;
    }
    setTags(next);
    setTagDraft("");
  }

  function toggleTag(tag: string) {
    setTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : normaliseTags([...cur, tag])
    );
  }

  // ---------------------------------------------------------------- submit --
  const busy = uploading || saving || recording;

  /**
   * The file goes browser→bucket directly, exactly like ReportUpload and the
   * journal photo, and only the resulting object key is submitted. A 50 MB
   * video would not survive a Server Action's body limit, and routing it
   * through the server would double the bytes on the wire for no gain.
   */
  async function submit(formData: FormData) {
    setLocalError(null);
    if (recording) {
      setLocalError("Stop the recording first.");
      return;
    }
    if (!pending) {
      setLocalError("Choose a photo or video, or record a voice note, before saving.");
      return;
    }

    const ext = extForMime(pending.file.type);
    if (!ext) {
      setLocalError("That file type isn't supported here.");
      return;
    }

    setUploading(true);
    let path: string;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired — sign in again.");

      path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("vet-reports")
        // baseMime: the bucket matches on the bare type, and a recorder hands
        // us "audio/webm;codecs=opus", which matches nothing.
        .upload(path, pending.file, { contentType: baseMime(pending.file.type), upsert: false });
      if (error) throw new Error(error.message);
    } catch (err) {
      setUploading(false);
      const message = err instanceof Error ? err.message : "Upload failed.";
      setLocalError(
        /mime type|not supported/i.test(message)
          ? `The storage bucket rejected this file type (${baseMime(pending.file.type)}). The media migration in supabase/schema.sql widens the bucket's allowed types — it may not have been applied yet.`
          : message
      );
      return;
    }
    setUploading(false);

    formData.set("storage_path", path);
    formData.set("mime_type", baseMime(pending.file.type));
    formData.set("size_bytes", String(pending.file.size));
    if (pending.duration != null) formData.set("duration_seconds", String(pending.duration));
    formData.set("user_tags", tags.join(","));
    formAction(formData);
  }

  // Success and orphan handling.
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      clearPending();
      setTags([]);
      setTagDraft("");
      setCaption("");
      setLocalError(null);
      setMicError(null);
      setElapsed(0);
      elapsedRef.current = 0;
      const t = localToday();
      setToday(t);
      setRecordedOn(t);
    }
    // The row never landed, so nothing references the object. Left alone it
    // would sit in the bucket forever — and storage_path is unique, so that
    // exact key could never be reused.
    if (state.orphanedPath) {
      createClient().storage.from("vet-reports").remove([state.orphanedPath]);
    }
  }, [state, clearPending]);

  const prompt = PROMPTS[kind];
  const message = state.error ?? localError;

  return (
    <form ref={formRef} action={submit} className="card mb-4 grid gap-4 p-4">
      <input type="hidden" name="pet_id" value={petId} />

      {/* ---- the three prompts ---- */}
      <div role="group" aria-label="What would you like to add?" className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(PROMPTS) as MediaKind[]).map((k) => {
          const selected = k === kind;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={selected}
              disabled={busy}
              onClick={() => {
                setKind(k);
                setLocalError(null);
                setMicError(null);
              }}
              className={`rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                selected
                  ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10"
                  : "border-[var(--border)] hover:border-brand-300"
              }`}
            >
              <span aria-hidden className="text-xl">
                {PROMPTS[k].emoji}
              </span>
              <span className="mt-1 block text-sm font-medium">{PROMPTS[k].title}</span>
            </button>
          );
        })}
      </div>

      <p className="muted text-xs">{prompt.blurb}</p>

      {/* ---- the picker for the selected prompt ---- */}
      {kind === "audio" ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            {recording ? (
              <>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  <span aria-hidden className="h-3 w-3 rounded-sm bg-white" />
                  Stop recording
                </button>
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm hover:border-brand-500"
                >
                  Discard
                </button>
                <span
                  role="timer"
                  aria-live="off"
                  className="inline-flex items-center gap-2 font-mono text-sm tabular-nums"
                >
                  <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
                  {formatDuration(elapsed) ?? "0:00"}
                  <span className="muted font-sans text-xs">
                    / {formatDuration(MEDIA_MAX_SECONDS.audio)} max
                  </span>
                </span>
              </>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                <span aria-hidden className="h-3 w-3 rounded-full bg-white" />
                Record a voice note
              </button>
            )}
          </div>

          <p className="muted text-xs">
            {recording
              ? "Recording. Say what you've noticed — when it started, what's different, anything you'd mention to a vet."
              : "Your browser will ask for permission to use the microphone. The recording stays private to your account, and it stops automatically at 3 minutes."}
          </p>

          {micError && (
            <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
              {micError}
            </p>
          )}

          <details className="text-xs">
            <summary className="muted min-h-11 cursor-pointer list-none py-3">
              …or attach an audio file you already have
            </summary>
            <input
              type="file"
              aria-label="Choose an audio file"
              accept={acceptFor("audio")}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f, "audio");
                e.target.value = "";
              }}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 disabled:opacity-60"
            />
          </details>
        </div>
      ) : (
        <div>
          <input
            id={`media-file-${kind}`}
            type="file"
            aria-label="Choose a photo or video"
            accept={acceptFor(kind)}
            // Offers the camera directly on a phone, which is the whole point
            // for "film the limp"; desktop browsers ignore it.
            capture={kind === "video" ? "environment" : undefined}
            disabled={busy}
            aria-describedby={`media-hint-${kind}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f, kind);
              e.target.value = "";
            }}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 disabled:opacity-60"
          />
          <p id={`media-hint-${kind}`} className="muted mt-1 text-xs">
            {MEDIA_LIMIT_HINT[kind]}
          </p>
        </div>
      )}

      {/* ---- what's about to be saved ---- */}
      {pending && (
        <div className="rounded-lg border border-[var(--border)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {pending.recorded ? "Voice note ready" : pending.file.name}
            </p>
            <button
              type="button"
              onClick={() => {
                clearPending();
                setLocalError(null);
              }}
              disabled={busy}
              className="muted min-h-11 text-xs underline underline-offset-2 disabled:opacity-60"
            >
              Remove
            </button>
          </div>
          <p className="muted mt-0.5 text-xs">
            {[
              formatBytes(pending.file.size),
              formatDuration(pending.duration),
              pending.kind === "photo" ? null : pending.duration == null ? "length unknown" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-2">
            {pending.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL
              <img
                src={pending.previewUrl}
                alt="The photo you're about to add"
                className="max-h-48 rounded-lg border border-[var(--border)] object-contain"
              />
            ) : pending.kind === "video" ? (
              <video
                src={pending.previewUrl}
                controls
                preload="metadata"
                className="max-h-64 w-full rounded-lg border border-[var(--border)]"
              />
            ) : (
              <audio src={pending.previewUrl} controls className="w-full" />
            )}
          </div>
        </div>
      )}

      {/* ---- caption ---- */}
      <div>
        <label htmlFor="media-caption" className="mb-1 block text-sm font-medium">
          {kind === "audio" ? "Anything to add in writing?" : "What's going on here?"}
        </label>
        <textarea
          id="media-caption"
          name="caption"
          rows={3}
          maxLength={MAX_CAPTION_LENGTH}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="She's been going to her water bowl more than usual this week, and she's slower getting up off the floor."
          aria-describedby="media-caption-hint"
          className={field}
        />
        <p id="media-caption-hint" className="muted mt-1 text-xs">
          Your own words, not a form. The detail nobody thought to make a tag for is
          usually the one that turns out to matter.
        </p>
      </div>

      {/* ---- tags ---- */}
      <fieldset>
        <legend className="mb-1 block text-sm font-medium">
          Tags <span className="muted font-normal">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => toggleTag(t)}
                className={`rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
                  on
                    ? "border-brand-500 bg-brand-600 text-white"
                    : "border-[var(--border)] hover:border-brand-400"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>

        {tags.some((t) => !SUGGESTED_TAGS.includes(t as (typeof SUGGESTED_TAGS)[number])) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags
              .filter((t) => !SUGGESTED_TAGS.includes(t as (typeof SUGGESTED_TAGS)[number]))
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={busy}
                  onClick={() => toggleTag(t)}
                  aria-label={`Remove tag ${t}`}
                  className="rounded-full border border-brand-500 bg-brand-600 px-3 py-1.5 text-xs text-white disabled:opacity-60"
                >
                  {t} ×
                </button>
              ))}
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={tagDraft}
            disabled={busy}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the tag; it must not submit the form and upload
              // something the owner wasn't finished describing.
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (tagDraft.trim()) addTag(tagDraft);
              }
            }}
            placeholder="Your own tag"
            aria-label="Add your own tag"
            className={`${field} max-w-[14rem]`}
          />
          <button
            type="button"
            disabled={busy || !tagDraft.trim()}
            onClick={() => addTag(tagDraft)}
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-sm hover:border-brand-500 disabled:opacity-60"
          >
            Add tag
          </button>
        </div>
        <p className="muted mt-1 text-xs">
          Up to {MAX_TAGS}. Tags only make this findable again later — they aren&apos;t a
          substitute for saying what you saw.
        </p>
      </fieldset>

      {/* ---- when ---- */}
      <div>
        <label htmlFor="media-date" className="mb-1 block text-sm font-medium">
          When was this?
        </label>
        <input
          id="media-date"
          name="recorded_on"
          type="date"
          max={today || undefined}
          value={recordedOn}
          onChange={(e) => setRecordedOn(e.target.value)}
          className={`${field} max-w-[12rem]`}
        />
      </div>

      {message && (
        <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={busy || !pending}
          aria-describedby={message ? errorId : undefined}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {uploading ? "Uploading…" : saving ? "Saving…" : "Add to the timeline"}
        </button>
      </div>
    </form>
  );
}
