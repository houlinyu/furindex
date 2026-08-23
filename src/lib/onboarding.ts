/**
 * The onboarding step list, as data, plus the pure arithmetic over it.
 *
 * Nothing in this file touches the database, React or `next/*`. It is imported
 * by server components, by a "use server" action module and by client
 * components, and that is only safe while it stays pure — see CONTRIBUTING and
 * the comment at the top of scripts/check-server-actions.mjs for the two
 * production outages that rule came from.
 *
 * WHAT THE STEP LIST IS FOR
 * Onboarding here is behavioural data collection, not a gate. Every block is
 * skippable, and "skipped" is a real answer we store rather than a failure we
 * retry — so the helpers below never speak of a step being missed, only of it
 * being answered or still open.
 */

export type OnboardingStepKey =
  | "basics"
  | "behavior-health"
  | "vaccines"
  | "media"
  | "wearable"
  | "dashboard";

/**
 * What we know about a block.
 *   - absent from the map : never answered. Still open, worth a gentle nudge.
 *   - "complete"          : the owner worked through it and moved on.
 *   - "skipped"           : the owner was asked and passed. Also an answer.
 */
export type OnboardingStepStatus = "complete" | "skipped";

/** Step key -> status. Absent keys are the common case, hence Partial. */
export type OnboardingProgress = Partial<Record<OnboardingStepKey, OnboardingStepStatus>>;

export type OnboardingStep = {
  key: OnboardingStepKey;
  /** Shown in the indicator and as the page heading. */
  title: string;
  /** One line, in the second person: why this block is worth the owner's time. */
  purpose: string;
  /** Which product surface the answers actually feed. Kept honest on purpose. */
  feeds: string;
  /**
   * The last step is the payoff screen, not a question. It is shown in the
   * indicator (it is where the owner is going) but it is never counted in the
   * progress arithmetic, and it cannot be "skipped" — there is nothing to skip.
   */
  terminal?: true;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    key: "basics",
    title: "Basics",
    purpose: "Name, species, breed and rough age — the frame everything else is read against.",
    feeds: "Breed notes, age-adjusted weight and activity baselines",
  },
  {
    key: "behavior-health",
    title: "Behaviour & health",
    purpose: "How they normally are, and anything they are already being treated for.",
    feeds: "Health signals — a change only means something against a normal",
  },
  {
    key: "vaccines",
    title: "Vaccines",
    purpose: "What they have had and when the next one is due.",
    feeds: "Reminders and the vet-visit summary",
  },
  {
    key: "media",
    title: "Photos",
    purpose: "A photo, and any paperwork you have a picture of.",
    feeds: "The pet's profile, and record extraction from vet documents",
  },
  {
    key: "wearable",
    title: "Wearable",
    purpose: "Whether there is a collar tracker, and whether you would want one.",
    feeds: "Activity data, and which integrations we build next",
  },
  {
    key: "dashboard",
    title: "All set",
    purpose: "What is on file so far, and where to pick it up again.",
    feeds: "The pet's own page",
    terminal: true,
  },
] as const;

/** The blocks that actually ask something. The dashboard is a destination. */
export const ONBOARDING_DATA_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS.filter(
  (s) => !s.terminal
);

export const FIRST_STEP: OnboardingStepKey = ONBOARDING_STEPS[0].key;
export const LAST_STEP: OnboardingStepKey =
  ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1].key;

// ------------------------------------------------------------- lookup ------

/**
 * Narrows an untrusted string — a URL segment, a form field — to a step key.
 * Everything that comes in from outside goes through here so an unknown step
 * can 404 rather than index into the array with `undefined` and throw.
 */
export function isStepKey(value: unknown): value is OnboardingStepKey {
  return (
    typeof value === "string" &&
    ONBOARDING_STEPS.some((s) => s.key === value)
  );
}

export function stepByKey(key: OnboardingStepKey): OnboardingStep {
  // Safe: the key type is only reachable through isStepKey.
  return ONBOARDING_STEPS.find((s) => s.key === key)!;
}

/** 0-based position in the walk. -1 for anything not in the list. */
export function stepIndex(key: OnboardingStepKey): number {
  return ONBOARDING_STEPS.findIndex((s) => s.key === key);
}

/** Human position, "3 of 6" — 1-based, for the indicator. */
export function stepNumber(key: OnboardingStepKey): number {
  return stepIndex(key) + 1;
}

export function nextStep(key: OnboardingStepKey): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(key) + 1] ?? null;
}

export function previousStep(key: OnboardingStepKey): OnboardingStep | null {
  const i = stepIndex(key);
  return i > 0 ? ONBOARDING_STEPS[i - 1] : null;
}

// ------------------------------------------------------------- progress ----

/**
 * jsonb comes back as `unknown`, and it comes back from a column any future
 * migration or hand-edit can put anything in. Unknown keys and unknown statuses
 * are dropped rather than trusted: a step that was renamed in the product
 * should read as unanswered, never as a crash on somebody's pet page.
 */
export function parseProgress(raw: unknown): OnboardingProgress {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: OnboardingProgress = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isStepKey(key)) continue;
    if (value === "complete" || value === "skipped") out[key] = value;
  }
  return out;
}

/** Answered either way — worked through OR passed on. */
export function isAnswered(
  progress: OnboardingProgress,
  key: OnboardingStepKey
): boolean {
  return progress[key] !== undefined;
}

export function completedSteps(progress: OnboardingProgress): OnboardingStep[] {
  return ONBOARDING_DATA_STEPS.filter((s) => progress[s.key] === "complete");
}

export function skippedSteps(progress: OnboardingProgress): OnboardingStep[] {
  return ONBOARDING_DATA_STEPS.filter((s) => progress[s.key] === "skipped");
}

/** Blocks nobody has answered yet, in walk order. */
export function openSteps(progress: OnboardingProgress): OnboardingStep[] {
  return ONBOARDING_DATA_STEPS.filter((s) => progress[s.key] === undefined);
}

/**
 * Percent of the asking blocks that were worked through, 0–100, rounded.
 *
 * Counts "complete" only — a skipped block is answered, but it did not produce
 * the data the percentage is about. The terminal dashboard step is excluded so
 * that arriving at the payoff screen does not by itself move the number.
 */
export function percentComplete(progress: OnboardingProgress): number {
  const total = ONBOARDING_DATA_STEPS.length;
  if (total === 0) return 100;
  return Math.round((completedSteps(progress).length / total) * 100);
}

/**
 * The first block that has never been answered, or null when they all have.
 * "Incomplete" here means unanswered, NOT "not completed" — a step the owner
 * skipped is settled, and sending them back into it every time they open the
 * app is exactly the nagging this whole flow is built to avoid.
 */
export function firstIncompleteStep(
  progress: OnboardingProgress
): OnboardingStepKey | null {
  return openSteps(progress)[0]?.key ?? null;
}

/**
 * Where "resume" should land.
 *
 * In order: the first unanswered block; failing that the step they were last
 * on, if it is still a real step and still worth returning to; failing that the
 * dashboard, because everything has been answered and there is nothing left to
 * ask. Never throws and never returns something that is not a step.
 */
export function resumeStepKey(
  progress: OnboardingProgress,
  lastStep?: string | null
): OnboardingStepKey {
  const open = firstIncompleteStep(progress);
  if (open) return open;
  if (isStepKey(lastStep) && !stepByKey(lastStep).terminal) return lastStep;
  return LAST_STEP;
}

/** True once every asking block has an answer of some kind. */
export function isOnboardingSettled(progress: OnboardingProgress): boolean {
  return openSteps(progress).length === 0;
}

/** The path for a step. One place, so a route rename is one edit. */
export function onboardingHref(petId: string, key: OnboardingStepKey): string {
  return `/pets/${petId}/onboarding/${key}`;
}

/** The entry point, which resolves to wherever the owner left off. */
export function onboardingResumeHref(petId: string): string {
  return `/pets/${petId}/onboarding`;
}
