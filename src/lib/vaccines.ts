/**
 * The core vaccine sets, their DEFAULT intervals, and the date maths that turns
 * "given on X" into "next one around Y".
 *
 * ── READ THIS BEFORE CHANGING A NUMBER ──────────────────────────────────────
 * Every interval in this file is a STARTING POINT FOR A CONVERSATION, not a
 * schedule. Three separate things override anything here, and all three of them
 * outrank us:
 *
 *   1. Local law. Rabies intervals are set by state, province or country
 *      statute, not by veterinary guidelines and certainly not by this app. The
 *      same dog, same vaccine, same vet is legally due in one year in one US
 *      state and three in the next one over.
 *   2. The product actually used. Rabies vaccines are licensed as 1-year OR
 *      3-year formulations; the interval belongs to the vial, and only the
 *      record from the clinic says which vial it was.
 *   3. The vet's judgement for this individual animal — age, health, titre
 *      results, whether it boards or swims or lives indoors.
 *
 * So the UI must present every one of these as editable, pre-filled, and
 * visibly provisional. It must never render an interval as a fact, never say
 * "due", "required", "overdue" in a medical voice, and never imply the app
 * knows this animal's schedule. It doesn't. It knows arithmetic.
 *
 * `intervalNote` on each entry exists to be SHOWN, not to sit in the source as
 * a comment to ourselves. If a note is not visible next to the number it
 * qualifies, the number is being presented as an assertion.
 *
 * ── WHERE THE NUMBERS CAME FROM ────────────────────────────────────────────
 * Published veterinary consensus guidelines, cited per-entry in `source`:
 *   - 2022 AAHA Canine Vaccination Guidelines (2024 update)
 *   - 2020 AAHA/AAFP Feline Vaccination Guidelines
 * These are US professional consensus documents. They are not law, they are not
 * global, and they describe adult animals past the initial puppy/kitten series
 * — which is a materially different and much shorter schedule that this block
 * deliberately does not try to model. See PUPPY_KITTEN_NOTE.
 *
 * Pure module: no "use client", no "use server", no imports from either. It is
 * consumed by both the server action and the client component, which is exactly
 * why it lives in src/lib — see the note at the top of scripts/check-server-actions.mjs.
 */

import { addDays, addMonths, daysBetween } from "@/lib/reminders";
import type { PetSpecies } from "@/lib/types";

/** The two species this block has a defined core set for. */
export type VaccineSpecies = "dog" | "cat";

/** Stable identifier. STORED. Never store a display label — labels get reworded. */
export type VaccineKey =
  | "rabies"
  | "dhpp"
  | "bordetella"
  | "leptospirosis"
  | "canine_influenza"
  | "fvrcp"
  | "felv";

/**
 * How confident the profession is that this one applies to every animal of the
 * species, as opposed to only those with a particular exposure risk. Shown in
 * the UI because the product spec calls all of these "core" and the guidelines
 * do not — three of the dog set are risk-based, and an owner deciding what to
 * ask their vet deserves to know which is which.
 */
export type VaccineTier = "core" | "risk_based";

export type VaccineDef = {
  key: VaccineKey;
  species: VaccineSpecies;
  /** Short display name, the one on the vaccination card. */
  label: string;
  /** What it is short for, spelled out. Empty when the name is already a word. */
  expansion: string | null;
  /** What it protects against, in plain English, no jargon. */
  covers: string;
  tier: TierWithReason;
  /**
   * PRE-FILLED DEFAULT ONLY. Months between doses for an adult animal past its
   * initial series. Always editable in the UI; never treated as authoritative
   * anywhere in this codebase.
   */
  defaultIntervalMonths: number;
  /** Why the number above is only a default. Rendered next to it, always. */
  intervalNote: string;
  /** The published guideline the default was read off. Rendered in the UI. */
  source: string;
  /**
   * True when the interval is set by law rather than by medicine. Currently
   * rabies only. The UI gives these an extra, louder caveat, because for these
   * the app is not merely imprecise — it has no standing to have an opinion.
   */
  jurisdictional: boolean;
};

type TierWithReason = { tier: VaccineTier; note: string };

const CORE: TierWithReason = {
  tier: "core",
  note: "Guidelines list this as recommended for essentially all animals of this species.",
};

const RISK_BASED = (why: string): TierWithReason => ({ tier: "risk_based", note: why });

/**
 * The shared caveat. One sentence, plain, no hedge-stacking — a wall of
 * disclaimer gets skipped, which defeats the point of having one.
 */
export const VACCINE_DISCLAIMER =
  "These dates are arithmetic, not medical advice. Every interval below is a starting point you can change — your vet's schedule and your local law decide what's actually due, and they take precedence over anything this app calculates.";

/** The rabies-specific caveat. Louder, because this one is a legal question. */
export const RABIES_NOTE =
  "Rabies boosters are set by local law, not by us: depending on your state, province or country — and on whether the clinic used a 1-year or 3-year vaccine — this is due in either 1 or 3 years. We can't know which. Check your rabies certificate or ask your clinic, then set the interval here to match.";

/**
 * Shown once above the set. The intervals here describe ADULT animals; a puppy
 * or kitten is on a completely different and much shorter schedule, and an app
 * that quietly applied a 3-year interval to a 10-week-old puppy would be
 * actively harmful. This block does not attempt the initial series.
 */
export const PUPPY_KITTEN_NOTE =
  "These intervals describe adult animals that have already finished their puppy or kitten series. Puppies and kittens are on a much shorter schedule of several doses a few weeks apart — if yours is still going through that, use the dates your vet gave you rather than these.";

// ------------------------------------------------------------------- dogs --

const DOG_VACCINES: VaccineDef[] = [
  {
    key: "rabies",
    species: "dog",
    label: "Rabies",
    expansion: null,
    covers: "Rabies — fatal once symptoms start, and transmissible to people.",
    tier: CORE,
    // Defaulting to the SHORTER of the two licensed intervals is deliberate.
    // Both 1-year and 3-year products exist and only the certificate says
    // which. Defaulting to 3 years where the truth is 1 would let a legally
    // required booster lapse silently, and rabies is the one vaccine where
    // lapsing has consequences beyond the animal — quarantine rules, boarding
    // and travel refusals, and in some jurisdictions liability. Defaulting to
    // 1 year where the truth is 3 costs the owner one unnecessary glance at a
    // reminder and a two-tap edit. Those are not symmetric errors.
    defaultIntervalMonths: 12,
    intervalNote:
      "1 or 3 years depending on where you live and which vaccine the clinic used — this is not ours to decide. We start at 1 year because it's the safer guess to be wrong about; change it to 3 if your certificate says so.",
    source: "1-year and 3-year formulations are both licensed (2022 AAHA Canine Vaccination Guidelines); the interval that applies to you is set by local statute.",
    jurisdictional: true,
  },
  {
    key: "dhpp",
    species: "dog",
    label: "DHPP",
    expansion: "Distemper, Hepatitis (adenovirus), Parvovirus, Parainfluenza",
    covers:
      "Distemper, infectious hepatitis, parvovirus and parainfluenza — the combination shot most dogs get as a puppy.",
    tier: CORE,
    defaultIntervalMonths: 36,
    intervalNote:
      "Guidelines put adult boosters at about every 3 years, but plenty of practices still run this annually and some owners titre-test instead. Your vet's call, not ours.",
    source: "2022 AAHA Canine Vaccination Guidelines: after the puppy series and a booster at ~1 year, revaccinate adults every 3 years or longer.",
    jurisdictional: false,
  },
  {
    key: "bordetella",
    species: "dog",
    label: "Bordetella",
    expansion: "Bordetella bronchiseptica",
    covers: "The main bacterial cause of kennel cough.",
    tier: RISK_BASED(
      "Guidelines treat this as risk-based rather than universal — it's about whether your dog boards, does daycare, grooming, classes or dog parks."
    ),
    defaultIntervalMonths: 12,
    intervalNote:
      "Usually yearly, but boarding kennels, daycares and groomers very often demand it within the last 6 months and won't take your dog otherwise. If yours boards, ask what the facility requires and set that.",
    source: "2022 AAHA Canine Vaccination Guidelines: noncore, annual revaccination; shorter intervals are common for dogs in frequent group settings.",
    jurisdictional: false,
  },
  {
    key: "leptospirosis",
    species: "dog",
    label: "Leptospirosis",
    expansion: null,
    covers:
      "A bacterial infection picked up from water, soil and wildlife urine. Also infects people.",
    tier: CORE,
    defaultIntervalMonths: 12,
    intervalNote:
      "Yearly is the usual rhythm after the initial two-dose series. How strongly it's recommended varies a lot by region and by whether your dog swims, hikes or meets wildlife.",
    source: "2022 AAHA Canine Vaccination Guidelines (2024 update), which moved leptospirosis to a recommended core vaccine: two doses 2-4 weeks apart, then annual revaccination.",
    jurisdictional: false,
  },
  {
    key: "canine_influenza",
    species: "dog",
    label: "Canine influenza",
    expansion: "H3N2 and H3N8 canine flu",
    covers: "Dog flu — spreads fast wherever dogs are housed together.",
    tier: RISK_BASED(
      "Risk-based: it's driven by whether dog flu is circulating where you are and whether your dog is around groups of dogs."
    ),
    defaultIntervalMonths: 12,
    intervalNote:
      "Yearly after the initial two-dose series. Whether it's worth giving at all depends on local outbreaks and your dog's routine — a genuine ask-your-vet question rather than a default.",
    source: "2022 AAHA Canine Vaccination Guidelines: noncore, two doses 2-4 weeks apart, then annual revaccination.",
    jurisdictional: false,
  },
];

// ------------------------------------------------------------------- cats --

const CAT_VACCINES: VaccineDef[] = [
  {
    key: "rabies",
    species: "cat",
    label: "Rabies",
    expansion: null,
    covers: "Rabies — fatal once symptoms start, and transmissible to people.",
    tier: CORE,
    // Same reasoning as the dog entry: default to the shorter licensed
    // interval, because being early is a two-tap annoyance and being late is a
    // legal problem. Indoor-only cats are still required to be vaccinated in
    // many jurisdictions, which owners are frequently surprised by.
    defaultIntervalMonths: 12,
    intervalNote:
      "1 or 3 years depending on your local law and which vaccine was used — including for indoor-only cats, which many places still require. We start at 1 year as the safer guess; change it to match your certificate.",
    source: "1-year and 3-year formulations are both licensed (2020 AAHA/AAFP Feline Vaccination Guidelines); the interval that applies to you is set by local statute.",
    jurisdictional: true,
  },
  {
    key: "fvrcp",
    species: "cat",
    label: "FVRCP",
    expansion: "Feline Viral Rhinotracheitis, Calicivirus, Panleukopenia",
    covers:
      "Two cat flu viruses plus panleukopenia (feline parvovirus) — the combination shot most cats get as a kitten.",
    tier: CORE,
    defaultIntervalMonths: 36,
    intervalNote:
      "Guidelines put adult boosters at about every 3 years for a low-risk indoor cat, and closer to yearly for cats in catteries, shelters or high-contact homes. Your vet knows which yours is.",
    source: "2020 AAHA/AAFP Feline Vaccination Guidelines: after the kitten series and a booster at ~1 year, revaccinate every 3 years for low-risk adult cats.",
    jurisdictional: false,
  },
  {
    key: "felv",
    species: "cat",
    label: "FeLV",
    expansion: "Feline Leukaemia Virus",
    covers:
      "Feline leukaemia — passed between cats by close contact, grooming and bites.",
    tier: RISK_BASED(
      "Core for kittens under a year whatever their lifestyle; after that it's risk-based, and mostly comes down to whether your cat goes outside or lives with an FeLV-positive cat."
    ),
    defaultIntervalMonths: 12,
    intervalNote:
      "Yearly for adult cats that still have exposure risk — outdoor access, or a housemate who is FeLV-positive. Many strictly indoor adult cats stop after the kitten series entirely. Worth asking rather than assuming either way.",
    source: "2020 AAHA/AAFP Feline Vaccination Guidelines: core for all kittens under 1 year; thereafter given annually to cats with ongoing exposure risk.",
    jurisdictional: false,
  },
];

/** The two sets, by species. */
export const VACCINE_SETS: Record<VaccineSpecies, VaccineDef[]> = {
  dog: DOG_VACCINES,
  cat: CAT_VACCINES,
};

/**
 * The core set for a species, or empty for the ones we have no defined set for.
 * Empty is a real answer: this block covers dogs and cats, and inventing a
 * rabbit or reptile schedule out of nothing would be exactly the made-up
 * medical authority the whole file is written to avoid.
 */
export function vaccinesFor(species: PetSpecies): VaccineDef[] {
  return species === "dog" || species === "cat" ? VACCINE_SETS[species] : [];
}

export function vaccineDef(
  species: PetSpecies,
  key: string
): VaccineDef | undefined {
  return vaccinesFor(species).find((v) => v.key === key);
}

/** Display name for a stored key, for surfaces that only kept the key. */
export function vaccineLabel(species: PetSpecies, key: string): string {
  return vaccineDef(species, key)?.label ?? key;
}

// ------------------------------------------------------------ tri-state ----

/**
 * The owner's answer. "unsure" is a first-class value and NOT a synonym for
 * "no": an owner who doesn't know needs a different next step (find the card,
 * ring the clinic) than one who knows it hasn't been done, and collapsing the
 * two would make the app confidently wrong about a third of real answers.
 */
export type AppliedAnswer = "yes" | "no" | "unsure";

export const APPLIED_ANSWERS: AppliedAnswer[] = ["yes", "no", "unsure"];

export const APPLIED_LABEL: Record<AppliedAnswer, string> = {
  yes: "Yes",
  no: "No",
  unsure: "Not sure",
};

/** What we say back once they've answered. Never a verdict on the animal. */
export const APPLIED_FOLLOW_UP: Record<AppliedAnswer, string> = {
  yes: "",
  no: "Nothing recorded. Worth raising at the next visit if you want to.",
  unsure: "Your vaccination card or your clinic's records will have it.",
};

// ---------------------------------------------------------------- leads ----

/**
 * How far ahead of the due date the reminder should land. The spec's three
 * options; nothing here invents a fourth.
 */
export type ReminderLead = "1w" | "2w" | "1m";

export const REMINDER_LEADS: { key: ReminderLead; label: string }[] = [
  { key: "1w", label: "1 week before" },
  { key: "2w", label: "2 weeks before" },
  { key: "1m", label: "1 month before" },
];

export const DEFAULT_LEAD: ReminderLead = "2w";

export function isReminderLead(v: string | null | undefined): v is ReminderLead {
  return v === "1w" || v === "2w" || v === "1m";
}

// ------------------------------------------------------------ date maths ---

/**
 * The next due date: `administeredOn` plus `months`, clamped to the last real
 * day of the target month.
 *
 * Delegates to addMonths in @/lib/reminders rather than doing its own date
 * arithmetic. That file already solved both hazards this would otherwise walk
 * into — DST, which makes a "+7 days" reminder fire a day early once a year,
 * and month-end rollover, which turns 31 January + 1 month into 3 March. There
 * is no second implementation of calendar maths in this codebase and there must
 * not be one.
 */
export function nextDueFrom(
  administeredOn: string,
  months: number
): string | null {
  if (!Number.isInteger(months) || months < 1 || months > 120) return null;
  return addMonths(administeredOn, months);
}

/**
 * When the REMINDER should land, given when the vaccine is due.
 *
 * "1 month before" is one calendar month, not 30 days — 15 March minus a month
 * is 15 February, which is what an owner means and what addMonths gives.
 */
export function reminderDateFor(dueOn: string, lead: ReminderLead): string | null {
  if (lead === "1w") return addDays(dueOn, -7);
  if (lead === "2w") return addDays(dueOn, -14);
  return addMonths(dueOn, -1);
}

/**
 * The exact gap in days between the reminder and the true due date.
 *
 * Stored on the reminder row as `reminder_lead_days` so the true due date is
 * always reconstructible as `due_on + reminder_lead_days`, even for the
 * calendar-month lead where the number is 28, 29, 30 or 31 depending on the
 * month it happened to land in. Derived, never typed in.
 */
export function leadDaysFor(reminderOn: string, dueOn: string): number | null {
  return daysBetween(reminderOn, dueOn);
}

/**
 * Everything the save needs for one vaccine, worked out in one place so the
 * server action and the UI cannot drift into disagreeing about a date.
 *
 * Returns null when there is nothing to compute — no date, or an interval the
 * owner cleared. Null is an answer here, not a failure.
 */
export type ComputedSchedule = {
  dueOn: string;
  remindOn: string;
  leadDays: number;
};

export function computeSchedule(
  administeredOn: string,
  intervalMonths: number,
  lead: ReminderLead
): ComputedSchedule | null {
  const dueOn = nextDueFrom(administeredOn, intervalMonths);
  if (!dueOn) return null;
  const remindOn = reminderDateFor(dueOn, lead);
  if (!remindOn) return null;
  const leadDays = leadDaysFor(remindOn, dueOn);
  if (leadDays === null) return null;
  return { dueOn, remindOn, leadDays };
}

/**
 * The reminder's title. Stable, boring, and free of any claim about urgency —
 * it is rendered by the existing reminder list next to words like "overdue",
 * and "Rabies booster" reads as a chore while "Rabies vaccination due" would
 * read as the app asserting a medical fact it does not know.
 */
export function reminderTitleFor(def: VaccineDef): string {
  return `${def.label} vaccination`;
}

/**
 * The note stored on the reminder row.
 *
 * Carries the TRUE due date in words, because the reminder's own `due_on` is
 * deliberately the earlier "poke me" date (see vaccine-actions.ts), and an
 * owner looking at the reminder needs to be able to see the real one without
 * doing arithmetic. Carries the caveat too, so the disclaimer survives the trip
 * out of this block and into the reminders list and the dashboard, which have
 * no idea this feature exists.
 */
export function reminderNoteFor(def: VaccineDef, dueOn: string): string {
  const caveat = def.jurisdictional
    ? "Interval is set by local law and by which vaccine was used — confirm with your clinic."
    : "Estimated from a default interval you can edit. Your vet's schedule takes precedence.";
  return `Estimated due ${dueOn}. ${caveat}`;
}
