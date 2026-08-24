/**
 * The body parts the guided health check (Block 4.2) walks an owner through,
 * and the vocabulary the dashboard uses to report them back.
 *
 * Pure module — no I/O, no clock. The rows below are the spec's table verbatim
 * so that the dashboard and the check screen cannot drift apart: whichever
 * session builds the capture flow reads its parts from here too.
 *
 * THE WORDING RULE THAT DRIVES THIS FILE
 * A status here is the OWNER'S OWN assessment, echoed back. It is never ours.
 * "not_sure" therefore renders as "you weren't sure" — not as a warning, not as
 * "needs attention", not as anything that reads like a finding. The distinction
 * matters because an amber square that means "the app thinks something is wrong"
 * and an amber square that means "you looked and couldn't tell" are different
 * claims, and only the second one is true.
 */

export type BodyPartId =
  | "eyes"
  | "mouth"
  | "ears"
  | "paws"
  | "coat"
  | "nose"
  | "poop"
  | "gait"
  | "behaviour";

export type CaptureKind = "photo" | "video" | "audio";

export type BodyPart = {
  id: BodyPartId;
  /** What the owner sees as the heading. */
  label: string;
  /** What the check asks them to capture. */
  capture: CaptureKind;
  /** Whether the check treats it as skippable. */
  optional: boolean;
  /** The one-line "why we ask", shown so this doesn't read as a photo dump. */
  why: string;
};

/** Spec 4.2, in the order the guided check walks them. */
export const BODY_PARTS: readonly BodyPart[] = [
  {
    id: "eyes",
    label: "Eyes",
    capture: "photo",
    optional: false,
    why: "Discharge, redness or cloudiness can be early signs of infection or aging.",
  },
  {
    id: "mouth",
    label: "Mouth, gums & teeth",
    capture: "photo",
    optional: false,
    why: "Gum colour and tartar build-up are early dental and systemic health indicators.",
  },
  {
    id: "ears",
    label: "Ears",
    capture: "photo",
    optional: false,
    why: "Odour, redness or discharge often signal ear infections.",
  },
  {
    id: "paws",
    label: "Paws & feet",
    capture: "photo",
    optional: false,
    why: "Cracked pads, swelling or limping patterns show up here first.",
  },
  {
    id: "coat",
    label: "Coat & skin",
    capture: "photo",
    optional: false,
    why: "Bald patches, flakes or lumps are easiest to catch with a clear photo.",
  },
  {
    id: "nose",
    label: "Nose",
    capture: "photo",
    optional: true,
    why: "Texture and discharge changes matter for some conditions.",
  },
  {
    id: "poop",
    label: "Poop",
    capture: "photo",
    optional: false,
    why: "Consistency and colour are some of the most useful at-home signals.",
  },
  {
    id: "gait",
    label: "Gait & movement",
    capture: "video",
    optional: false,
    why: "Limping or stiffness is much easier to catch in motion than in a still.",
  },
  {
    id: "behaviour",
    label: "General behaviour",
    capture: "video",
    optional: false,
    why: "Anything odd — vocalising, panting, restlessness.",
  },
];

export const BODY_PART_IDS: readonly string[] = BODY_PARTS.map((p) => p.id);

export function bodyPartById(id: string | null | undefined): BodyPart | null {
  if (!id) return null;
  return BODY_PARTS.find((p) => p.id === id) ?? null;
}

// ------------------------------------------------------------- assessments --

/** Exactly the three values spec 4.2 stores. Nothing is inferred beyond them. */
export type SelfAssessment = "looks_normal" | "not_sure" | "looks_off";

export function isSelfAssessment(v: unknown): v is SelfAssessment {
  return v === "looks_normal" || v === "not_sure" || v === "looks_off";
}

/** The fourth state is ours, and it is an absence rather than an assessment. */
export type PartStatus = SelfAssessment | "unchecked";

/**
 * How each status is described. Every one of these is phrased as something the
 * OWNER did, because that is what actually happened — we have no opinion about
 * any of these body parts and must not appear to.
 */
export const PART_STATUS_LABEL: Record<PartStatus, string> = {
  looks_normal: "Looked normal to you",
  not_sure: "You weren't sure",
  looks_off: "You marked it as looking off",
  unchecked: "Not checked yet",
};

/** The short form for a badge, where the long sentence won't fit. */
export const PART_STATUS_SHORT: Record<PartStatus, string> = {
  looks_normal: "Looked normal",
  not_sure: "Wasn't sure",
  looks_off: "You flagged it",
  unchecked: "Not checked",
};

/**
 * Colour, with the same discipline as TrendCard: never the only channel. Every
 * badge that uses these also prints PART_STATUS_SHORT, so a colour-blind reader
 * or a bad phone screen loses nothing.
 *
 * Green is allowed here where it is not allowed on a trend card, because it is
 * reporting a thing the owner said ("that looked fine to me") rather than a
 * clean bill of health we would not be entitled to give. The same reasoning
 * licenses the rose on `looks_off`: it is the owner's flag, quoted back to
 * them, not our assessment of their animal.
 */
export const PART_STATUS_TONE: Record<PartStatus, string> = {
  looks_normal:
    "border-emerald-600/40 text-emerald-800 dark:border-emerald-400/30 dark:text-emerald-300",
  not_sure:
    "border-amber-600/40 text-amber-800 dark:border-amber-400/30 dark:text-amber-300",
  looks_off:
    "border-rose-600/40 text-rose-800 dark:border-rose-400/30 dark:text-rose-300",
  unchecked: "border-[var(--border)] text-[var(--muted)]",
};

/** The dot glyph, so status survives being read aloud or printed in mono. */
export const PART_STATUS_GLYPH: Record<PartStatus, string> = {
  looks_normal: "●",
  not_sure: "◐",
  looks_off: "◆",
  unchecked: "○",
};

/**
 * The sentence that has to sit next to any amber square. Written out here
 * rather than inline in a component so it cannot be reworded into a warning by
 * a later edit that only looks at the JSX.
 */
export const AMBER_MEANS =
  "Amber means you weren't sure when you looked — not that something is wrong.";

/** What one recorded look at one body part reduces to for the dashboard. */
export type PartCheck = {
  part: BodyPartId;
  /** "YYYY-MM-DD" — the day the owner looked. */
  checkedOn: string;
  assessment: SelfAssessment;
  note: string | null;
};

export type PartState = {
  part: BodyPart;
  status: PartStatus;
  lastChecked: string | null;
  /** Whole days since the last look, or null if never. */
  daysSince: number | null;
  note: string | null;
  /** Every recorded look at this part, newest first. */
  history: PartCheck[];
};

/**
 * How long before we mention that a part hasn't been looked at lately.
 *
 * A month, and deliberately soft: the spec asks for a re-check cadence so the
 * onboarding check becomes a habit, and a habit prompt is a nudge about the
 * OWNER'S routine. It says nothing about the animal, and the copy that uses it
 * must keep it that way.
 */
export const RECHECK_AFTER_DAYS = 30;

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = new Date(fromIso.slice(0, 10) + "T00:00:00").getTime();
  const b = new Date(toIso.slice(0, 10) + "T00:00:00").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Fold every recorded look into one row per body part.
 *
 * Parts with no look at all come back as "unchecked" rather than being dropped:
 * on a body map, a missing square and a square nobody has looked at are
 * different facts, and only the second one is true here.
 */
export function summarizeParts(
  checks: readonly PartCheck[] | null | undefined,
  today: string,
): PartState[] {
  const byPart = new Map<BodyPartId, PartCheck[]>();
  for (const c of checks ?? []) {
    if (!bodyPartById(c.part) || !isSelfAssessment(c.assessment)) continue;
    const bucket = byPart.get(c.part);
    if (bucket) bucket.push(c);
    else byPart.set(c.part, [c]);
  }

  return BODY_PARTS.map((part) => {
    const history = (byPart.get(part.id) ?? []).sort((a, b) =>
      b.checkedOn.localeCompare(a.checkedOn),
    );
    const latest = history[0] ?? null;
    return {
      part,
      status: latest ? latest.assessment : ("unchecked" as PartStatus),
      lastChecked: latest?.checkedOn ?? null,
      daysSince: latest ? daysBetween(latest.checkedOn, today) : null,
      note: latest?.note ?? null,
      history,
    };
  });
}

/** True when a part has been looked at once and is now overdue another look. */
export function isDueRecheck(state: PartState): boolean {
  return state.daysSince !== null && state.daysSince >= RECHECK_AFTER_DAYS;
}
