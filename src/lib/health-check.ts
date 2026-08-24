/**
 * Pure data and helpers for the guided health check (Block 4, screen 4.2) and
 * the wellbeing note (4.3).
 *
 * Lives in src/lib/ rather than beside either component because both a Server
 * Action module and a Client Component import it, and a "use server" file may
 * export only async functions.
 *
 * The "why we ask" strings are the spec's own wording, verbatim. They are the
 * thing that stops a nine-card checklist reading as a random photo dump, so
 * they are not paraphrased here and should not be paraphrased later.
 */
import type { CaptureType, HealthCheckPart, SelfAssessment } from "@/lib/types";

export type PartSpec = {
  part: HealthCheckPart;
  /** What the owner is being asked to look at. */
  label: string;
  emoji: string;
  /** What the spec asks for. The file input is more permissive than this. */
  capture: CaptureType;
  /** What the badge says. "Video, 5–10s" is the gait card's ask, not every card's. */
  captureLabel: string;
  /** Verbatim from the spec — shown on the card, every time. */
  why: string;
  /** Practical framing for the capture itself. Ours, not the spec's. */
  hint: string;
  /** The spec marks the nose card optional. Everything here is skippable; this
   *  one says so on its face because the spec did. */
  optional?: boolean;
};

export const HEALTH_CHECK_PARTS: PartSpec[] = [
  {
    part: "eyes",
    label: "Eyes",
    emoji: "👁️",
    capture: "photo",
    captureLabel: "Photo",
    why: "Discharge, redness, or cloudiness can be early signs of infection or aging",
    hint: "Straight on, in daylight if you can. Both eyes in one shot is fine.",
  },
  {
    part: "mouth",
    label: "Mouth / gums / teeth",
    emoji: "🦷",
    capture: "photo",
    captureLabel: "Photo",
    why: "Gum colour and tartar buildup are early dental & systemic health indicators",
    hint: "Lift the lip gently. If they're not having it today, skip it.",
  },
  {
    part: "ears",
    label: "Ears",
    emoji: "👂",
    capture: "photo",
    captureLabel: "Photo",
    why: "Odour, redness, or discharge often signal ear infections",
    hint: "Inside the flap. One ear per photo if they look different to each other.",
  },
  {
    part: "paws",
    label: "Paws / feet",
    emoji: "🐾",
    capture: "photo",
    captureLabel: "Photo",
    why: "Cracked pads, swelling, or limping patterns show up here first",
    hint: "Pads up. Get the one you've been wondering about.",
  },
  {
    part: "coat",
    label: "Coat / skin",
    emoji: "🧴",
    capture: "photo",
    captureLabel: "Photo",
    why: "Bald patches, flakes, or lumps are easiest to catch with a clear photo",
    hint: "Part the fur over anything you want to keep an eye on.",
  },
  {
    part: "nose",
    label: "Nose",
    emoji: "👃",
    capture: "photo",
    captureLabel: "Photo",
    why: "Texture/discharge changes can matter for some conditions",
    hint: "Close up. The spec calls this one optional — plenty of people skip it.",
    optional: true,
  },
  {
    part: "poop",
    label: "Poop",
    emoji: "💩",
    capture: "photo",
    captureLabel: "Photo",
    why: "Consistency and colour are some of the most useful at-home signals",
    hint: "Yes, really. It's one of the most useful things you can show a vet.",
  },
  {
    part: "gait",
    label: "Gait / movement",
    emoji: "🚶",
    capture: "video",
    captureLabel: "Video, 5–10s",
    why: "Limping or stiffness is much easier to catch in motion",
    hint: "5–10 seconds walking away from you and back. A still photo works too.",
  },
  {
    part: "behaviour",
    label: "General behaviour",
    emoji: "🐕",
    capture: "video",
    captureLabel: "Video or audio",
    why: "Anything odd — vocalising, panting, restlessness",
    hint: "A short clip, or just write down what you noticed.",
  },
];

export const HEALTH_CHECK_PART_LABEL: Record<HealthCheckPart, string> =
  Object.fromEntries(HEALTH_CHECK_PARTS.map((p) => [p.part, p.label])) as Record<
    HealthCheckPart,
    string
  >;

export const HEALTH_CHECK_PART_EMOJI: Record<HealthCheckPart, string> =
  Object.fromEntries(HEALTH_CHECK_PARTS.map((p) => [p.part, p.emoji])) as Record<
    HealthCheckPart,
    string
  >;

export const HEALTH_CHECK_PART_IDS: HealthCheckPart[] = HEALTH_CHECK_PARTS.map((p) => p.part);

// ------------------------------------------------------------ self-assessment --
/**
 * The owner's read, in the owner's words. Three options, presented and styled
 * identically — no colour ramp, no ordering from good to bad, no icons that
 * grade. "Something looks off" is a note the owner made, not a warning the app
 * raised, and it must never be rendered as one.
 */
export const SELF_ASSESSMENTS: SelfAssessment[] = ["looks_normal", "not_sure", "looks_off"];

export const SELF_ASSESSMENT_LABEL: Record<SelfAssessment, string> = {
  looks_normal: "Looks normal to me",
  not_sure: "Not sure",
  looks_off: "Something looks off",
};

/** How it reads back in a history list, in the first person, as the owner's note. */
export const SELF_ASSESSMENT_RECAP: Record<SelfAssessment, string> = {
  looks_normal: "You said it looked normal",
  not_sure: "You weren't sure",
  looks_off: "You said something looked off",
};

// ---------------------------------------------------------------- sensations --
export type SensationTag =
  | "appetite" | "energy" | "bathroom" | "mobility" | "sleep" | "mood_change" | "no_changes";

export const SENSATION_TAGS: SensationTag[] = [
  "appetite", "energy", "bathroom", "mobility", "sleep", "mood_change", "no_changes",
];

export const SENSATION_TAG_LABEL: Record<SensationTag, string> = {
  appetite: "Appetite",
  energy: "Energy",
  bathroom: "Bathroom",
  mobility: "Moving around",
  sleep: "Sleep",
  mood_change: "Mood",
  no_changes: "No changes noticed",
};

export const SENSATION_TAG_EMOJI: Record<SensationTag, string> = {
  appetite: "🍽️",
  energy: "⚡",
  bathroom: "🚽",
  mobility: "🦵",
  sleep: "😴",
  mood_change: "🙂",
  no_changes: "👌",
};

/** "Nothing has changed" and "six things have changed" cannot both be true. */
export const NO_CHANGES_TAG: SensationTag = "no_changes";

export function isSensationTag(value: string): value is SensationTag {
  return (SENSATION_TAGS as string[]).includes(value);
}

export function tagLabel(tag: string): string {
  return isSensationTag(tag) ? SENSATION_TAG_LABEL[tag] : tag;
}

export function tagEmoji(tag: string): string {
  return isSensationTag(tag) ? SENSATION_TAG_EMOJI[tag] : "•";
}

/**
 * The 1–5 slider. Descriptive, not evaluative: 1 is not a failing grade, it is
 * a flat day, and plenty of animals have flat days.
 */
export const MOOD_LABEL: Record<number, string> = {
  1: "Very flat",
  2: "Quieter than usual",
  3: "About normal",
  4: "Lively",
  5: "Bouncing off the walls",
};

// --------------------------------------------------------------------- media --
/**
 * MIME → file extension, split by what kind of capture it is. The extension
 * matters because the storage path carries it and nothing else records the type
 * of the object in the bucket.
 */
export const PHOTO_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const VIDEO_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const AUDIO_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/wav": "wav",
};

export function captureTypeForMime(mime: string): CaptureType | null {
  if (PHOTO_MIME[mime]) return "photo";
  if (VIDEO_MIME[mime]) return "video";
  if (AUDIO_MIME[mime]) return "audio";
  return null;
}

export function extensionForMime(mime: string): string | null {
  return PHOTO_MIME[mime] ?? VIDEO_MIME[mime] ?? AUDIO_MIME[mime] ?? null;
}

/**
 * What the shared 'vet-reports' bucket will currently accept. Photos have
 * always been allowed; video and audio are being added by separate work on the
 * bucket's `allowed_mime_types`. Until that lands, the cards offer photos and
 * say so plainly rather than inviting a capture that will bounce.
 */
export type MediaSupport = {
  photo: boolean;
  video: boolean;
  audio: boolean;
  /** False when the bucket config could not be read; the UI then stays optimistic. */
  known: boolean;
};

/** Assumed when the bucket's configuration can't be read (RLS on storage.buckets). */
export const OPTIMISTIC_MEDIA_SUPPORT: MediaSupport = {
  photo: true,
  video: true,
  audio: true,
  known: false,
};

export function mediaSupportFrom(allowed: string[] | null | undefined): MediaSupport {
  if (!allowed || allowed.length === 0) return OPTIMISTIC_MEDIA_SUPPORT;
  const has = (prefix: string, table: Record<string, string>) =>
    allowed.some((m) => m === `${prefix}/*` || m in table);
  return {
    photo: has("image", PHOTO_MIME),
    video: has("video", VIDEO_MIME),
    audio: has("audio", AUDIO_MIME),
    known: true,
  };
}

/** The `accept` attribute for a card, narrowed to what the bucket will take. */
export function acceptFor(spec: PartSpec, support: MediaSupport): string {
  const types: string[] = [];
  if (support.photo) types.push(...Object.keys(PHOTO_MIME));
  // Photo cards stay photo-only; the two motion cards take a still as a
  // legitimate fallback, which is why they list images too.
  if (spec.capture !== "photo") {
    if (support.video) types.push(...Object.keys(VIDEO_MIME));
    if (support.audio) types.push(...Object.keys(AUDIO_MIME));
  }
  return types.join(",");
}

/**
 * Supabase returns this when a file's MIME type isn't in the bucket's
 * allow-list. It is the one upload failure that is a missing feature rather
 * than a broken upload, and it gets its own message.
 */
export function isMimeRejection(message: string): boolean {
  return /mime type|not supported|invalid_mime/i.test(message);
}

/**
 * The bucket's own ceiling is 20 MB, so nothing here may exceed it — a file
 * over that is rejected by storage with a much less helpful message than the
 * one the card can give first. A 5–10 second phone clip is typically 5–15 MB,
 * which fits; a 30-second one often does not, hence the "5–10 seconds" wording
 * on the card being a real constraint rather than a style note.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_CLIP_BYTES = 20 * 1024 * 1024;

export function maxBytesFor(capture: CaptureType): number {
  return capture === "photo" ? MAX_PHOTO_BYTES : MAX_CLIP_BYTES;
}
