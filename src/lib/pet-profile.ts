/**
 * The profile questionnaire, as data.
 *
 * WHY THIS FILE EXISTS AT ALL
 * Seven blocks of questions rendered by hand would put the option list in the
 * JSX, which means the server action validating a submission would have its own
 * second copy of that list. The two copies drift, and the way you find out is a
 * silently-dropped answer. Here the questions are declared once; the form
 * renders from them and the action validates against them.
 *
 * WHY KEYS ARE SEPARATE FROM LABELS
 * The stored value is always `key` — 'joint_mobility', 'food_treats' — and
 * never `label`. Labels are copy: they get softened, reworded and translated.
 * A stored label would mean "Joint / mobility" and "Joint or mobility" become
 * two different cohorts in the same column, and nothing would ever tell you.
 * Keys are the contract with the database; treat renaming one as a migration.
 *
 * Plain module, no "use client" and no React: it is imported by the quiz
 * (client) and by the server action and page (server). A value exported from a
 * "use client" module and imported into a server component builds clean and
 * throws at request time — that bug already shipped here once.
 */

import type { ProfileTristate, PetProfile } from "@/lib/types";

export type ProfileOption = {
  /** Stored verbatim. Never change one without migrating the column. */
  key: string;
  label: string;
};

/** Columns on pet_profiles that hold a set of option keys. */
export type ProfileArrayColumn =
  | "personality"
  | "enjoys"
  | "conditions"
  | "diet"
  | "routine"
  | "home_type"
  | "lives_with"
  | "track_interest";

/** Columns on pet_profiles that hold a single yes / no / not-sure answer. */
export type ProfileChoiceColumn = "has_conditions" | "uses_wearable";

export type MultiQuestion = {
  kind: "multi";
  column: ProfileArrayColumn;
  prompt: string;
  /** One line under the prompt. Optional — most questions don't need one. */
  hint?: string;
  options: readonly ProfileOption[];
  /**
   * Only asked when another question in the same block holds this answer.
   * The follow-up list is cleared when the gate isn't met — see the action.
   */
  showWhen?: { column: ProfileChoiceColumn; equals: ProfileTristate };
};

export type ChoiceQuestion = {
  kind: "choice";
  column: ProfileChoiceColumn;
  prompt: string;
  hint?: string;
  options: readonly { key: ProfileTristate; label: string }[];
};

/**
 * Block 1 edits the pet row itself (name, species, breed, sex, birth date)
 * rather than pet_profiles, so it is rendered by hand instead of from options.
 */
export type BasicsQuestion = { kind: "basics" };

export type ProfileQuestion = MultiQuestion | ChoiceQuestion | BasicsQuestion;

export type ProfileBlock = {
  id: string;
  title: string;
  /** One line. Says what the block is for, never why it's important. */
  intro: string;
  questions: readonly ProfileQuestion[];
};

const YES_NO_NOT_SURE: readonly { key: ProfileTristate; label: string }[] = [
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
  { key: "not_sure", label: "Not sure" },
];

const YES_NO: readonly { key: ProfileTristate; label: string }[] = [
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
];

export const PROFILE_BLOCKS: readonly ProfileBlock[] = [
  {
    id: "basics",
    title: "Basics",
    intro: "The few details everything else is read against. Change anything that isn't right.",
    questions: [{ kind: "basics" }],
  },
  {
    id: "personality",
    title: "Personality & behaviour",
    intro: "How they are day to day. Pick as many as fit — most animals are several of these.",
    questions: [
      {
        kind: "multi",
        column: "personality",
        prompt: "How would you describe your pet?",
        options: [
          { key: "playful", label: "Playful" },
          { key: "calm", label: "Calm" },
          { key: "energetic", label: "Energetic" },
          { key: "shy", label: "Shy" },
          { key: "social", label: "Social" },
          { key: "independent", label: "Independent" },
          { key: "affectionate", label: "Affectionate" },
          { key: "anxious", label: "Anxious" },
          { key: "curious", label: "Curious" },
          { key: "protective", label: "Protective" },
        ],
      },
      {
        kind: "multi",
        column: "enjoys",
        prompt: "What does your pet usually enjoy?",
        options: [
          { key: "playing", label: "Playing" },
          { key: "walking", label: "Walking" },
          { key: "cuddling", label: "Cuddling" },
          { key: "exploring", label: "Exploring" },
          { key: "sleeping", label: "Sleeping" },
          { key: "people", label: "Being around people" },
          { key: "other_animals", label: "Being around other animals" },
          { key: "food_treats", label: "Food & treats" },
          { key: "toys", label: "Toys" },
        ],
      },
    ],
  },
  {
    id: "health",
    title: "Health & medical history",
    // Neutral by design: this block records what the owner reports and nothing
    // more. No block in this questionnaire interprets an answer, and this is
    // the one where doing so would be actively harmful.
    intro: "What you'd tell a new vet. This is a note of what you've told us — it isn't a diagnosis, and nothing here is advice.",
    questions: [
      {
        kind: "choice",
        column: "has_conditions",
        prompt: "Any current health conditions?",
        hint: "“Not sure” is a normal answer.",
        options: YES_NO_NOT_SURE,
      },
      {
        kind: "multi",
        column: "conditions",
        prompt: "Which areas?",
        hint: "Only what you already know about. Pick as many as apply.",
        showWhen: { column: "has_conditions", equals: "yes" },
        options: [
          { key: "allergies", label: "Allergies" },
          { key: "skin", label: "Skin" },
          { key: "digestive", label: "Digestive" },
          { key: "respiratory", label: "Respiratory" },
          { key: "joint_mobility", label: "Joint / mobility" },
          { key: "heart", label: "Heart" },
          { key: "kidney_urinary", label: "Kidney / urinary" },
          { key: "dental", label: "Dental" },
          { key: "other", label: "Something else" },
        ],
      },
    ],
  },
  {
    id: "nutrition",
    title: "Nutrition",
    intro: "What's normally in the bowl. Pick more than one if they get a mix.",
    questions: [
      {
        kind: "multi",
        column: "diet",
        prompt: "What does your pet primarily eat?",
        options: [
          { key: "dry", label: "Dry food" },
          { key: "wet", label: "Wet food" },
          { key: "raw", label: "Raw" },
          { key: "homemade", label: "Homemade" },
          { key: "prescription", label: "Prescription diet" },
          { key: "mixed", label: "Mixed" },
          { key: "other", label: "Something else" },
        ],
      },
    ],
  },
  {
    id: "routine",
    title: "Daily routine",
    intro: "What an ordinary day looks like for them.",
    questions: [
      {
        kind: "multi",
        column: "routine",
        prompt: "What does a usual day include?",
        options: [
          { key: "mostly_indoors", label: "Mostly indoors" },
          { key: "outdoor_time", label: "Outdoor time" },
          { key: "walks", label: "Walks" },
          { key: "playtime", label: "Playtime" },
          { key: "alone_long", label: "Long periods alone" },
          { key: "social_time", label: "Social time" },
          { key: "training", label: "Training" },
          { key: "naps", label: "Multiple naps" },
        ],
      },
    ],
  },
  {
    id: "environment",
    title: "Environment & lifestyle",
    intro: "Where they live and who's around.",
    questions: [
      {
        kind: "multi",
        column: "home_type",
        prompt: "Where does your pet live?",
        options: [
          { key: "apartment", label: "Apartment" },
          { key: "house", label: "House" },
          { key: "house_yard", label: "House with a yard" },
          { key: "farm_rural", label: "Farm / rural" },
          { key: "indoor_only", label: "Indoor only" },
          { key: "indoor_outdoor", label: "Indoor & outdoor" },
        ],
      },
      {
        kind: "multi",
        column: "lives_with",
        prompt: "Who does your pet live with?",
        options: [
          { key: "adults", label: "Adults" },
          { key: "children", label: "Children" },
          { key: "dogs", label: "Other dogs" },
          { key: "cats", label: "Other cats" },
          { key: "other_animals", label: "Other animals" },
        ],
      },
    ],
  },
  {
    id: "wearables",
    title: "Activity & wearables",
    intro: "Whether anything is already measuring them, and what you'd want measured.",
    questions: [
      {
        kind: "choice",
        column: "uses_wearable",
        prompt: "Does your pet use a wearable or tracker?",
        options: YES_NO,
      },
      {
        kind: "multi",
        column: "track_interest",
        prompt: "What would you like to be able to track?",
        hint: "Whether or not you have a device today.",
        options: [
          { key: "activity", label: "Activity" },
          { key: "sleep", label: "Sleep" },
          { key: "heart_rate", label: "Heart rate" },
          { key: "temperature", label: "Temperature" },
          { key: "location", label: "Location / GPS" },
          { key: "weight", label: "Weight" },
          { key: "eating", label: "Eating" },
          { key: "drinking", label: "Drinking" },
          { key: "other", label: "Something else" },
        ],
      },
    ],
  },
];

export const BLOCK_COUNT = PROFILE_BLOCKS.length;

export function blockIndexById(id: string): number {
  return PROFILE_BLOCKS.findIndex((b) => b.id === id);
}

export function blockById(id: string): ProfileBlock | null {
  return PROFILE_BLOCKS.find((b) => b.id === id) ?? null;
}

/**
 * Clamp a block index that came from a URL. `?block=99` and `?block=banana`
 * are both a person editing an address bar, and neither is worth an error page.
 */
export function clampBlockIndex(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) return 0;
  return Math.min(Math.max(n, 0), BLOCK_COUNT - 1);
}

export function isTristate(v: unknown): v is ProfileTristate {
  return v === "yes" || v === "no" || v === "not_sure";
}

/** Every question in a block, including ones currently hidden by a gate. */
export function questionsOf(block: ProfileBlock) {
  return {
    multi: block.questions.filter((q): q is MultiQuestion => q.kind === "multi"),
    choice: block.questions.filter((q): q is ChoiceQuestion => q.kind === "choice"),
    hasBasics: block.questions.some((q) => q.kind === "basics"),
  };
}

/**
 * Keep only keys this build actually offers for that column.
 *
 * Posted values are strings from a browser and can be anything. Unknown keys
 * are not silently dropped — a dropped answer looks exactly like an answer that
 * saved, and the owner has no way to notice. The action refuses the whole
 * submission instead.
 */
export function checkOptionKeys(
  column: ProfileArrayColumn,
  posted: readonly string[]
): { ok: true; keys: string[] } | { ok: false; unknown: string[] } {
  const allowed = new Set<string>();
  for (const block of PROFILE_BLOCKS) {
    for (const q of block.questions) {
      if (q.kind === "multi" && q.column === column) {
        for (const o of q.options) allowed.add(o.key);
      }
    }
  }
  // Deduplicate: a hand-crafted POST can repeat a key, and Postgres would
  // happily store it twice, which then double-counts in any cohort query.
  const keys = [...new Set(posted)];
  const unknown = keys.filter((k) => !allowed.has(k));
  return unknown.length ? { ok: false, unknown } : { ok: true, keys };
}

/** Display label for a stored key, falling back to the key itself. */
export function labelForKey(column: ProfileArrayColumn, key: string): string {
  for (const block of PROFILE_BLOCKS) {
    for (const q of block.questions) {
      if (q.kind === "multi" && q.column === column) {
        const hit = q.options.find((o) => o.key === key);
        if (hit) return hit.label;
      }
    }
  }
  return key;
}

export const TRISTATE_LABEL: Record<ProfileTristate, string> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure",
};

/**
 * How far through the questionnaire this pet is.
 *
 * Counts blocks the owner has BEEN THROUGH, not blocks with answers in them —
 * skipping is a complete answer to an optional question, and a meter that
 * refuses to move when someone skips is just a nag with a progress bar.
 * Block 1 counts as done as soon as the pet exists, because creating the pet
 * is where those fields were filled in.
 */
export function profileProgress(profile: PetProfile | null): {
  done: number;
  total: number;
  started: boolean;
  /** Every block has been through at least once, answered or skipped. */
  complete: boolean;
  /** First block not yet been through — where "continue" should land. */
  nextIndex: number;
} {
  const visited = new Set(profile?.completed_blocks ?? []);
  // Block 1 is the pet's own name/species/breed/birth date, which were filled in
  // when the pet was created — so it counts as done for the meter even before
  // the questionnaire has been opened.
  const done = PROFILE_BLOCKS.filter((b) => visited.has(b.id) || b.id === "basics").length;
  // `nextIndex` deliberately does NOT get that courtesy: "continue" has to land
  // on a screen the owner has actually seen the questions on, and confirming
  // the basics is the gentlest possible first screen.
  const firstUnvisited = PROFILE_BLOCKS.findIndex((b) => !visited.has(b.id));
  return {
    done,
    total: BLOCK_COUNT,
    started: visited.size > 0,
    complete: firstUnvisited === -1,
    nextIndex: firstUnvisited === -1 ? 0 : firstUnvisited,
  };
}

/** Answers actually recorded, in block order — for the review screen and card. */
export function answeredSummary(
  profile: PetProfile | null
): { blockId: string; title: string; lines: { prompt: string; value: string }[] }[] {
  if (!profile) return [];
  return PROFILE_BLOCKS.map((block) => {
    const lines: { prompt: string; value: string }[] = [];
    for (const q of block.questions) {
      if (q.kind === "multi") {
        const keys = profile[q.column] ?? [];
        if (keys.length) {
          lines.push({
            prompt: q.prompt,
            value: keys.map((k) => labelForKey(q.column, k)).join(", "),
          });
        }
      } else if (q.kind === "choice") {
        const v = profile[q.column];
        if (v) lines.push({ prompt: q.prompt, value: TRISTATE_LABEL[v] });
      }
    }
    return { blockId: block.id, title: block.title, lines };
  }).filter((b) => b.lines.length > 0);
}

/**
 * A short, readable set of labels for the pet page card.
 *
 * Multi-select answers only: a bare "Yes" chip lifted out of "any current
 * health conditions?" is meaningless on its own and, on a health question,
 * worse than meaningless.
 */
export function profileHighlights(profile: PetProfile | null, limit = 8): string[] {
  if (!profile) return [];
  const out: string[] = [];
  for (const block of PROFILE_BLOCKS) {
    for (const q of block.questions) {
      if (q.kind !== "multi") continue;
      for (const key of profile[q.column] ?? []) out.push(labelForKey(q.column, key));
    }
  }
  return out.slice(0, limit);
}
