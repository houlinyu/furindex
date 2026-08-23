/**
 * Owner-reported activity, anchored to published accelerometry.
 *
 * WHY THIS EXISTS AT ALL
 * This app has no wearable, so the only activity data it can ever hold is what
 * an owner remembers and taps. The usual shape for that is an invented
 * "energy 1–5" slider — which is easy to build, easy to tap, and means nothing:
 * one owner's 3 is another owner's 5, and neither can be compared to a number
 * from anywhere else, including the same pet a year earlier.
 *
 * So the rungs of this ladder are not invented. They are the five behaviours
 * that Karimjee, Harron, Piercy & Daley (2024) actually measured on a collar
 * accelerometer, and the number we store is the mean vector magnitude they
 * published for that behaviour, in g. That buys three things a 1–5 scale can't:
 *
 *   1. The gaps between rungs are real. Trotting is ~30x lying down, not
 *      "4 instead of 1" — so a percentage change computed over this series by
 *      lib/baselines.ts describes a real ratio of movement intensities.
 *   2. The scale is external. It doesn't drift with how the app feels today.
 *   3. There is a published active/inactive cut point (ACTIVE_THRESHOLD_G) that
 *      lands *between* two of our rungs, which is what makes "active means
 *      walking or above" a definition we inherited rather than one we picked.
 *
 * WHAT THIS IS NOT
 * It is not a measurement of your pet. Nobody put an accelerometer on them. It
 * is an owner's recollection of a day, filed under the published intensity of
 * the behaviour they're describing. Every piece of UI copy below is written to
 * keep that distinction visible rather than let the decimal point imply
 * precision we do not have.
 *
 * Pure module: no I/O, no clock beyond todayIso(), safe in server or client.
 */

import type { CustomValue, FieldDefinition, PetSpecies } from "@/lib/types";

// ------------------------------------------------------------- the source --

/**
 * The study every number in this file comes from.
 *
 * Kept as one exported object rather than as copy inlined in three components,
 * because a citation that drifts between screens is worse than no citation —
 * it tells the reader we aren't actually reading it either.
 */
export const ACTIVITY_CITATION = {
  authors: "Karimjee, Harron, Piercy & Daley",
  year: 2024,
  title:
    "Quantifying dog activity with collar-mounted accelerometry: behaviour-specific vector magnitudes",
  journal: "Royal Society Open Science",
  volume: "11(7)",
  articleNumber: "240119",
  doi: "10.1098/rsos.240119",
  /** One-line form for a footnote where a full reference would crowd the UI. */
  short: "Karimjee et al. 2024, R. Soc. Open Sci. 11(7):240119",
} as const;

/**
 * Who was actually measured. This is here so the caveats below can be specific
 * ("22 dogs, 6 of them beagle puppies") instead of hand-wavy ("a study") —
 * a reader can judge 22 dogs for themselves; they can't judge "research shows".
 */
export const ACTIVITY_STUDY_POPULATION = {
  totalDogs: 22,
  colonyBeagles: 6,
  colonyBeagleAgeRange: "3–13 months",
  petDogs: 16,
  petDogMeanAgeYears: 4,
  petDogAgeSdYears: 3,
  petDogMeanMassKg: 19.2,
  petDogMassSdKg: 10,
  device: "Axivity AX3 collar accelerometer",
  samplingHz: 200,
  /** Plain sentence, used verbatim in the UI. Keep it factual and countable. */
  summary:
    "22 dogs wearing an Axivity AX3 collar accelerometer at 200 Hz — 6 colony beagles aged 3–13 months and 16 pet dogs averaging 4 years and 19 kg",
} as const;

// ------------------------------------------------------ the active cut point --

/**
 * The study's active/inactive boundary, in g.
 *
 * Sensitivity 90.6% / specificity 90.8% in the beagles, 90.3% / 88.4% in the
 * pet dogs. Note where it falls: above standing (0.13 g) and below walking
 * (0.26 g). That is the whole reason this ladder splits where it does — the
 * line between "not active" and "active" is not our editorial judgement about
 * what counts as exercise, it is a published cut point that happens to sit in
 * the gap between two measured behaviours.
 */
export const ACTIVE_THRESHOLD_G = 0.154;

export const ACTIVE_THRESHOLD_ACCURACY = {
  beagles: { sensitivity: 90.6, specificity: 90.8 },
  petDogs: { sensitivity: 90.3, specificity: 88.4 },
} as const;

// ---------------------------------------------------------------- the ladder --

export type ActivityRungId = "lying" | "sitting" | "standing" | "walking" | "trotting";

export type ActivityRung = {
  id: ActivityRungId;
  /** 1–5, lowest intensity first. For ordering and keyboard hints only — it is
   *  NOT what gets stored. The stored value is vectorMagnitudeG. */
  step: 1 | 2 | 3 | 4 | 5;
  /** What the button says. */
  label: string;
  /** Plain English, no jargon — the sentence under the button. */
  description: string;
  /** The behaviour name as the paper calls it, so the anchor is traceable. */
  studyBehaviour: string;
  /** Published mean vector magnitude for that behaviour, in g. Stored as-is. */
  vectorMagnitudeG: number;
  /** Published SD, in g. Shown so nobody reads 0.26 as a precise quantity —
   *  the spread around these means is wide and overlapping. */
  sdG: number;
};

/**
 * The five rungs, lowest first. Ordering matters: the UI renders them in array
 * order and the active/inactive line is drawn between index 2 and 3.
 */
export const ACTIVITY_RUNGS: readonly ActivityRung[] = [
  {
    id: "lying",
    step: 1,
    label: "Lying down",
    description: "Mostly lying down — resting or asleep for most of the day.",
    studyBehaviour: "lie down",
    vectorMagnitudeG: 0.02,
    sdG: 0.05,
  },
  {
    id: "sitting",
    step: 2,
    label: "Sitting up",
    description: "Sitting up and awake, but not really moving around.",
    studyBehaviour: "sit",
    vectorMagnitudeG: 0.08,
    sdG: 0.08,
  },
  {
    id: "standing",
    step: 3,
    label: "Up on their feet",
    description: "Standing and pottering about, without going anywhere much.",
    studyBehaviour: "stand",
    vectorMagnitudeG: 0.13,
    sdG: 0.09,
  },
  {
    id: "walking",
    step: 4,
    label: "Walking",
    description: "Up and moving at a walk — a normal walk or a mooch round the block.",
    studyBehaviour: "walk",
    vectorMagnitudeG: 0.26,
    sdG: 0.14,
  },
  {
    id: "trotting",
    step: 5,
    label: "Trotting or running",
    description: "Trotting, running or playing hard for a good part of the day.",
    studyBehaviour: "trot",
    vectorMagnitudeG: 0.59,
    sdG: 0.24,
  },
] as const;

// --------------------------------------------------------------- storage keys --

/**
 * The field_definitions label activity lives under.
 *
 * It has to be a stable, well-known string: field_definitions is UNIQUE on
 * (owner_id, label), so the label IS the key we look the definition up by.
 * Changing it later would silently orphan every value already stored under the
 * old one — the owner's history wouldn't be deleted, it would just stop being
 * activity. Treat this constant as part of the data model.
 */
export const ACTIVITY_FIELD_LABEL = "Activity level";

/**
 * Stored as a real unit, not a rank. `g` is what makes the series comparable to
 * ACTIVE_THRESHOLD_G and to the paper — and it is what HealthSignals/TrendCard
 * will print next to the number, so it has to be honest about what the figure is.
 */
export const ACTIVITY_FIELD_UNIT = "g";

/** field_definitions.field_type — numeric so it flows into the baseline machinery. */
export const ACTIVITY_FIELD_TYPE = "number" as const;

/** field_definitions.scope — 'event': many dated values per pet, one per day. */
export const ACTIVITY_FIELD_SCOPE = "event" as const;

// --------------------------------------------------------------- conversions --

/** Look a rung up by id. Returns null for anything not in the ladder. */
export function rungById(id: string | null | undefined): ActivityRung | null {
  if (!id) return null;
  return ACTIVITY_RUNGS.find((r) => r.id === id) ?? null;
}

export function isActivityRungId(id: string | null | undefined): id is ActivityRungId {
  return rungById(id) !== null;
}

/**
 * Rung -> the number we store. This is the single conversion point; nothing
 * else should ever hard-code 0.26.
 */
export function activityValueForRung(id: ActivityRungId): number {
  const rung = rungById(id);
  // Unreachable for a valid ActivityRungId; throwing here would be a crash in a
  // server action, so fall back to the lowest rung's anchor instead.
  return rung ? rung.vectorMagnitudeG : ACTIVITY_RUNGS[0].vectorMagnitudeG;
}

/**
 * Stored number -> rung, for showing an owner what they already logged.
 *
 * Nearest match within a tolerance rather than strict equality: numeric columns
 * come back from Postgres as numeric and could round-trip as 0.2600000000001.
 * The rungs are at least 0.05 g apart, so 0.02 g of slack can't pick the wrong
 * one. Anything further out than that is not one of our rungs at all — most
 * likely a number a vet report put in this field — and we return null rather
 * than pretending it maps onto the ladder.
 */
export function rungForActivityValue(value: number | null | undefined): ActivityRung | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  let best: ActivityRung | null = null;
  let bestDelta = Infinity;
  for (const rung of ACTIVITY_RUNGS) {
    const delta = Math.abs(rung.vectorMagnitudeG - value);
    if (delta < bestDelta) {
      best = rung;
      bestDelta = delta;
    }
  }
  return bestDelta <= 0.02 ? best : null;
}

/**
 * Does this rung sit above the study's active/inactive cut point?
 *
 * Deliberately computed from the anchor and the threshold rather than
 * hard-coded as "walking and above", so if either number is ever corrected the
 * split moves with it instead of silently disagreeing with the constants.
 */
export function isActiveRung(rung: ActivityRung): boolean {
  return rung.vectorMagnitudeG >= ACTIVE_THRESHOLD_G;
}

/** Same test for a raw stored value. */
export function isActiveVectorMagnitude(value: number): boolean {
  return Number.isFinite(value) && value >= ACTIVE_THRESHOLD_G;
}

/** The first rung that counts as active — where the UI draws the dividing line. */
export const FIRST_ACTIVE_RUNG: ActivityRung =
  ACTIVITY_RUNGS.find(isActiveRung) ?? ACTIVITY_RUNGS[ACTIVITY_RUNGS.length - 1];

/** The last rung below the cut point. */
export const LAST_INACTIVE_RUNG: ActivityRung =
  [...ACTIVITY_RUNGS].reverse().find((r) => !isActiveRung(r)) ?? ACTIVITY_RUNGS[0];

// -------------------------------------------------------------------- dates --

/**
 * Today as YYYY-MM-DD in UTC.
 *
 * UTC on purpose: the server action defaults recorded_on the same way, and a
 * client-side local date would disagree with it either side of midnight, which
 * is exactly when "one entry per day" starts producing two.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ lookups --

/** The owner's activity definition, if they have one yet. */
export function findActivityDefinition(
  definitions: readonly FieldDefinition[] | null | undefined,
): FieldDefinition | null {
  if (!definitions) return null;
  return definitions.find((d) => d.label === ACTIVITY_FIELD_LABEL) ?? null;
}

/**
 * What (if anything) is already logged for this pet on `date`.
 *
 * Returns the rung so the UI can highlight it. Returns null both when nothing
 * is logged and when the stored number isn't one of our rungs — the caller
 * treats "not on the ladder" as "nothing to highlight", which is right: we
 * shouldn't light up a button that doesn't correspond to what's stored.
 */
export function activityRungLoggedOn(
  values: readonly CustomValue[] | null | undefined,
  definitions: readonly FieldDefinition[] | null | undefined,
  date: string = todayIso(),
): ActivityRung | null {
  const def = findActivityDefinition(definitions);
  if (!def || !values) return null;
  const row = values.find(
    (v) => v.definition_id === def.id && v.recorded_on === date && v.value_number != null,
  );
  return row ? rungForActivityValue(row.value_number) : null;
}

// ------------------------------------------------------------------ wording --

/**
 * The caveat that has to appear anywhere the g figures are shown.
 *
 * Species-aware because the honest statement genuinely differs. For a dog these
 * are reference values from animals of the same species (though still only 22
 * of them, a quarter of which were beagle puppies). For anything else there is
 * no equivalent published ladder, so the *words* still describe what the owner
 * saw but the *numbers* are borrowed from a different species and should be
 * read as a consistent yardstick, not as a measurement.
 */
export function activitySourceCaveat(species: PetSpecies): string {
  const base =
    `The intensities behind these steps were measured in ${ACTIVITY_STUDY_POPULATION.summary} ` +
    `(${ACTIVITY_CITATION.short}).`;

  if (species === "dog") {
    return (
      `${base} They're dog data — but only 22 dogs, 6 of them beagle puppies, so read ` +
      `them as a shared yardstick rather than a norm your dog should hit.`
    );
  }

  return (
    `${base} That's dog data. There is no equivalent published scale for ` +
    `${SPECIES_PLURAL[species]}, so here the steps describe what you saw and the ` +
    `g figures are a dog-derived yardstick carried across — not a measurement of your pet.`
  );
}

/** Plural species nouns for the caveat sentence. Real words, not a template. */
const SPECIES_PLURAL: Record<PetSpecies, string> = {
  dog: "dogs",
  cat: "cats",
  bird: "birds",
  rabbit: "rabbits",
  reptile: "reptiles",
  small_mammal: "small mammals",
  other: "this species",
};

/**
 * The line that stops this feature turning into a symptom tracker.
 *
 * Gruen et al. (2017), 98 cats: mean activity did NOT differ between arthritic
 * and healthy cats (p = 0.541), and cats with higher owner-reported pain were
 * MORE active during the day, not less. So the intuitive reading — quiet pet,
 * something wrong — is not supported even in the species people most often
 * apply it to. This log records what an owner saw. It is not evidence about
 * why, and the UI must never let it be read that way.
 */
export const ACTIVITY_NOT_A_SYMPTOM_NOTE =
  "This records what you saw, and nothing more. A quiet day is just a quiet day: " +
  "in a study of 98 cats, average activity didn't separate arthritic animals from " +
  "healthy ones, and the cats in more pain were more active during the day, not less " +
  "(Gruen et al. 2017). Anything you're actually worried about belongs in the journal, " +
  "or with your vet.";

/** Where the published cut point falls on this ladder, as a sentence. */
export function describeActiveThreshold(): string {
  return (
    `The study's active/inactive line is ${ACTIVE_THRESHOLD_G} g, which falls between ` +
    `${LAST_INACTIVE_RUNG.label.toLowerCase()} (${LAST_INACTIVE_RUNG.vectorMagnitudeG} g) and ` +
    `${FIRST_ACTIVE_RUNG.label.toLowerCase()} (${FIRST_ACTIVE_RUNG.vectorMagnitudeG} g) — ` +
    `so "active" here means walking or above, which is the paper's definition rather than ours.`
  );
}

/** "0.26 g" with the trailing-zero noise trimmed. */
export function formatG(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${parseFloat(value.toFixed(2))} g`;
}
