/**
 * Pure helpers for the media history. No React, no Supabase, no "use client"
 * and no "use server" — both halves import from here.
 *
 * This file exists because of the rule the build enforces: a "use server"
 * module may export ONLY async functions, so every constant the server actions
 * and the UI need to agree on (the caps, the accepted types, the tag rules)
 * has to live somewhere neutral. Duplicating them would mean the client's
 * error message and the server's validation could drift apart, and the first
 * anyone would know is an owner losing a 40 MB upload to a message that said
 * 50 MB was fine.
 */

import type { MediaKind, PetMedia } from "@/lib/types";

/**
 * A row plus the signed URL its bytes are behind. Signed on the server in one
 * batch and handed to the client component; it lives here rather than in the
 * client module so a server component can name it without importing anything
 * from a "use client" file.
 */
export type MediaItem = PetMedia & { url: string | null };

// --------------------------------------------------------------- caps ------
//
// Video and audio get large fast, and every one of these numbers is shown to
// the owner before they pick a file — see MEDIA_LIMIT_HINT.
//
//  photo  10 MB            — same cap as a journal photo, so the two upload
//                            paths never disagree about what a phone photo is.
//  video  50 MB /  60 s    — 1080p30 h.264 runs ~0.5 MB per second, so a full
//                            minute lands around 30 MB and clears the cap. A
//                            clip of a limp or a scratch is ten seconds; a
//                            minute is already generous, and past that nobody
//                            re-watches it and the vet certainly doesn't.
//  audio  15 MB / 180 s    — Opus at ~32 kbps is 0.24 MB a minute, so three
//                            minutes of recording is under a megabyte. The
//                            15 MB only bites when an owner uploads an
//                            uncompressed WAV from elsewhere. Three minutes is
//                            long enough to say what's been going on and short
//                            enough that it stays listen-back-able.
//
// All three sit under the bucket's 100 MB ceiling on purpose: the specific,
// honest client-side message should always be the one that fires.
export const MEDIA_MAX_BYTES: Record<MediaKind, number> = {
  photo: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
};

/** Null for photos — a still has no length. */
export const MEDIA_MAX_SECONDS: Record<MediaKind, number | null> = {
  photo: null,
  video: 60,
  audio: 180,
};

/**
 * The limits, in words, exactly as they are shown above every picker.
 *
 * DERIVED from the constants rather than written out, because these two things
 * drifting apart is the whole failure this file exists to prevent: a hint that
 * says 60 seconds over a check that enforces 30 is worse than no hint, since an
 * owner films to the number they were given and then loses the clip.
 */
const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;
const secs = (n: number) =>
  n % 60 === 0 ? `${n / 60} minute${n === 60 ? "" : "s"}` : `${n} seconds`;

export const MEDIA_LIMIT_HINT: Record<MediaKind, string> = {
  photo: `JPG, PNG, WebP, HEIC or GIF, up to ${mb(MEDIA_MAX_BYTES.photo)}.`,
  video: `Up to ${secs(MEDIA_MAX_SECONDS.video!)} and ${mb(MEDIA_MAX_BYTES.video)} — a short clip beats a long one.`,
  audio: `Up to ${secs(MEDIA_MAX_SECONDS.audio!)} and ${mb(MEDIA_MAX_BYTES.audio)}.`,
};

// ---------------------------------------------------------- mime types ------
//
// Extension per accepted type. The map is also the allow-list: a type that
// isn't a key here is rejected before anything is uploaded. Keep it in step
// with the bucket's allowed_mime_types in supabase/schema.sql — the bucket is
// the backstop, this is the gate.
export const MEDIA_EXT: Record<string, string> = {
  // photo
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  // video
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
  // audio
  "audio/webm": "weba",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/**
 * `MediaRecorder` reports its type as "audio/webm;codecs=opus", and a File
 * picked on a Mac can arrive as "video/quicktime; codecs=..." too. The bucket's
 * allowed_mime_types matches the bare type, and so does MEDIA_EXT, so the
 * parameters have to come off before either sees it. Missing this is a silent
 * "mime type not supported" on every single voice note.
 */
export function baseMime(mime: string): string {
  return mime.split(";")[0]!.trim().toLowerCase();
}

/** Which of the three kinds a mime type belongs to, or null if we don't take it. */
export function mediaKindForMime(mime: string): MediaKind | null {
  const base = baseMime(mime);
  if (!(base in MEDIA_EXT)) return null;
  if (base.startsWith("image/")) return "photo";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return null;
}

export function extForMime(mime: string): string | null {
  return MEDIA_EXT[baseMime(mime)] ?? null;
}

/** `accept` attribute for one kind's file input. */
export function acceptFor(kind: MediaKind): string {
  const prefix = kind === "photo" ? "image/" : kind === "video" ? "video/" : "audio/";
  return Object.keys(MEDIA_EXT).filter((m) => m.startsWith(prefix)).join(",");
}

// ---------------------------------------------------------------- tags ------

/** Cheap, obvious starting points. Not a vocabulary — the free text is. */
export const SUGGESTED_TAGS = [
  "limping",
  "scratching",
  "coughing",
  "vomiting",
  "low energy",
  "restless",
  "skin",
  "eyes",
  "ears",
  "teeth",
  "appetite",
  "drinking",
  "toilet",
  "breathing",
  "after medication",
  "looking well",
] as const;

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 24;
export const MAX_CAPTION_LENGTH = 2000;

/**
 * Lower-cased, trimmed, whitespace-collapsed, de-duplicated, capped.
 *
 * Lower-casing on purpose: "Limping" and "limping" are the same tag, and an
 * owner who filters by one and doesn't see the other has been quietly lied to
 * about their own history. Order of first appearance is kept so the chips read
 * the way they were typed.
 */
export function normaliseTags(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of raw) {
    const clean = t.trim().replace(/\s+/g, " ").toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (!clean) continue;
    if (out.includes(clean)) continue;
    out.push(clean);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Splits a comma-separated tag field. Used by the picker and the actions. */
export function parseTagList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return normaliseTags(raw.split(","));
}

// ------------------------------------------------------- migration state ----

/**
 * True when a query failed because pet_media does not exist yet.
 *
 * TWO codes, because two different layers report the same thing and only one of
 * them is the common case. supabase-js talks to PostgREST, which answers
 * **PGRST205** — "Could not find the table 'public.pet_media' in the schema
 * cache" — whenever the table is absent from its cached schema. That is what a
 * project that has not run the migration actually returns, and it is a string
 * no owner can act on. Postgres's own 42P01 (undefined_table) only surfaces on
 * paths that reach the database directly.
 *
 * Testing 42P01 alone looks right and never fires. It shipped that way in the
 * first draft of this feature and the result was the raw "schema cache"
 * sentence rendered in red under an owner's upload.
 */
export function isMissingTableError(
  err: { code?: string; message?: string } | null | undefined
): boolean {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "42P01") return true;
  // Belt and braces for a client version that reports no code at all.
  return /schema cache|does not exist/i.test(err.message ?? "") &&
    /pet_media/.test(err.message ?? "");
}

/** What to tell somebody when that happens. Shared so both halves say it identically. */
export const MEDIA_NOT_MIGRATED =
  "Media isn't set up on this database yet — the pet_media migration at the end of supabase/schema.sql still needs to be run.";

// ------------------------------------------------------------ formatting ----

/** "0:08", "1:42". Null length renders as nothing at all, never as "0:00". */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.round(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Every distinct user tag across a set of rows, with counts, most-used first.
 * Drives the filter bar; a tag nobody used should not be offered as a filter.
 */
export function tagCounts(rows: readonly { user_tags: string[] }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const t of r.user_tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
