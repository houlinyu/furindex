/**
 * What a visitor told us about their pet BEFORE they had an account.
 *
 * The landing page already works out the species, often the breed, and holds a
 * photo — and then the sign-up round trip threw all of it away and showed them a
 * blank form. This module is the only thing that crosses that boundary.
 *
 * WHY sessionStorage AND NOT localStorage
 * This is a single intent ("I am, right now, setting up a record for this
 * animal"), not a preference. It should die with the tab: someone who abandons
 * half way and comes back next week must not be handed a stale guess about a
 * pet they may no longer be adding, and a shared or public computer must not
 * leak one visitor's pet into the next visitor's form. localStorage would
 * outlive both.
 *
 * WHY IT IS NEVER TRUSTED
 * sessionStorage is user-editable client state — anyone can open devtools and
 * write anything into this key. So:
 *   - every read re-validates the whole shape and drops the record entirely if
 *     any field is off (a half-trusted record is worse than none);
 *   - what survives is treated as a PRE-FILL SUGGESTION shown with its
 *     provenance and a one-click clear, never as a fact about the animal;
 *   - the server is still the authority. createPet trims and re-checks
 *     everything it inserts, and `species` lands in the `pet_species` Postgres
 *     enum, so a tampered value is rejected by the database rather than stored.
 *     Nothing here relaxes any of that.
 */

/** Versioned: a shape change must invalidate old records, not misread them. */
const KEY = "furindex.funnel-intent.v1";

/**
 * Long enough for a sign-up (including a fumbled password and a second attempt),
 * short enough that a tab left open over lunch doesn't pre-fill a form the
 * visitor has forgotten telling us anything about.
 */
const MAX_AGE_MS = 30 * 60 * 1000;

/** Matches the breed input's own maxLength; the column is unbounded text. */
const MAX_BREED_CHARS = 80;

/**
 * Ceiling on the stored preview. sessionStorage is a ~5 MB origin-wide budget
 * shared with everything else, and a raw phone photo base64s to ~6 MB — over
 * the limit on its own. Only a downscaled preview ever goes in here.
 */
const MAX_PHOTO_CHARS = 600_000;

/** The funnel only ever produces these two. Anything else is not our record. */
export const FUNNEL_SPECIES = ["dog", "cat"] as const;
export type FunnelSpecies = (typeof FUNNEL_SPECIES)[number];

/** Where the guess came from — drives the wording shown next to the pre-fill. */
export type FunnelSource = "scan" | "choice";

export type FunnelIntent = {
  species: FunnelSpecies;
  /** Null whenever we don't have one we'd stand behind. */
  breed: string | null;
  source: FunnelSource;
  /**
   * A downscaled `data:image/jpeg` preview of the dropped photo, or null.
   * Deliberately NOT the original file: see the note in NewPetForm about why
   * this is shown and not uploaded.
   */
  photo: string | null;
  savedAt: number;
};

function available(): Storage | null {
  // Server render, and browsers that throw on storage access in private mode.
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isFunnelSpecies(value: unknown): value is FunnelSpecies {
  return typeof value === "string" && (FUNNEL_SPECIES as readonly string[]).includes(value);
}

/**
 * Read and re-validate. Returns null — never a partial record — if anything is
 * missing, mistyped, out of range or expired, and clears the key when it does,
 * so a corrupt value can't keep costing a parse on every navigation.
 */
export function readFunnelIntent(): FunnelIntent | null {
  const store = available();
  if (!store) return null;

  const raw = store.getItem(KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    const o = parsed as Record<string, unknown>;

    if (o.v !== 1) throw new Error("wrong version");
    if (!isFunnelSpecies(o.species)) throw new Error("bad species");
    if (o.source !== "scan" && o.source !== "choice") throw new Error("bad source");
    if (typeof o.savedAt !== "number" || !Number.isFinite(o.savedAt)) {
      throw new Error("bad timestamp");
    }
    // A future timestamp means a tampered or clock-skewed record; treat it as
    // expired rather than as valid forever.
    const age = Date.now() - o.savedAt;
    if (age < 0 || age > MAX_AGE_MS) throw new Error("expired");

    let breed: string | null = null;
    if (typeof o.breed === "string") {
      // Strip control characters before length-capping: this string is about
      // to become the default value of a text input.
      const cleaned = o.breed.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
      breed = cleaned ? cleaned.slice(0, MAX_BREED_CHARS) : null;
    } else if (o.breed !== null && o.breed !== undefined) {
      throw new Error("bad breed");
    }

    let photo: string | null = null;
    if (typeof o.photo === "string") {
      // Only a self-contained JPEG data URL is ever rendered. A remote or
      // blob: URL here would be someone else's content in an <img> on our page.
      const ok =
        o.photo.startsWith("data:image/jpeg;base64,") && o.photo.length <= MAX_PHOTO_CHARS;
      photo = ok ? o.photo : null;
    } else if (o.photo !== null && o.photo !== undefined) {
      throw new Error("bad photo");
    }

    return { species: o.species, breed, source: o.source, photo, savedAt: o.savedAt };
  } catch {
    clearFunnelIntent();
    return null;
  }
}

export function saveFunnelIntent(intent: {
  species: FunnelSpecies;
  breed?: string | null;
  source: FunnelSource;
  photo?: string | null;
}): void {
  const store = available();
  if (!store) return;

  const breed = intent.breed?.trim().slice(0, MAX_BREED_CHARS) || null;
  const base = { v: 1 as const, species: intent.species, breed, source: intent.source, savedAt: Date.now() };
  const photo = intent.photo && intent.photo.length <= MAX_PHOTO_CHARS ? intent.photo : null;

  try {
    store.setItem(KEY, JSON.stringify({ ...base, photo }));
  } catch {
    // Out of quota. The picture is the nice-to-have; the species and breed are
    // the point of the whole exercise, so drop the photo and keep the rest.
    try {
      store.setItem(KEY, JSON.stringify({ ...base, photo: null }));
    } catch {
      // Storage is unusable (private mode, disabled). The funnel still works,
      // it just doesn't carry anything — which is the behaviour we replaced.
    }
  }
}

export function clearFunnelIntent(): void {
  const store = available();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * A small JPEG data URL from a picked file, for showing back to the visitor.
 *
 * Downscaled on purpose: this only ever has to be recognisable at 96px, and the
 * original would blow the sessionStorage budget on its own. Returns null on any
 * failure — a missing preview must never block the rest of the pre-fill.
 */
export async function previewDataUrl(file: File, maxEdge = 384): Promise<string | null> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const url = canvas.toDataURL("image/jpeg", 0.72);
    return url.startsWith("data:image/jpeg;base64,") && url.length <= MAX_PHOTO_CHARS ? url : null;
  } catch {
    return null;
  }
}
