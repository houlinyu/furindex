import Link from "next/link";
import {
  ONBOARDING_DATA_STEPS,
  completedSteps,
  isOnboardingSettled,
  onboardingResumeHref,
  skippedSteps,
  type OnboardingProgress,
} from "@/lib/onboarding";
import type { Pet } from "@/lib/types";

/**
 * "You started setting this up — here is where you left off", for the pet page.
 *
 * WHY IT IS WORDED THE WAY IT IS
 * This is the same problem PetProgress solves and it is held to the same three
 * constraints, because the moment a resume prompt starts keeping score it turns
 * into a guilt meter about somebody's animal:
 *
 *   - It counts what is PRESENT. "Three blocks filled in", never "two missing".
 *     The words missing, incomplete, unfinished and remaining do not appear.
 *   - No red, no warning colour, no badge. Nothing here is a failure state and
 *     nothing here is urgent.
 *   - It stops. Once every block has an answer — worked through OR passed on —
 *     the CTA is withdrawn, and once they are all worked through this renders
 *     nothing at all. A prompt that never goes away is nagging.
 *
 * A SKIPPED BLOCK IS AN ANSWER, NOT A GAP
 * The brief asks this to nudge about skipped blocks, and it does — once, in the
 * same breath as the ones nobody has opened yet, described as "still open" with
 * a way in. What it will not do is re-prompt a block the owner has already
 * declined as though the decline had not registered. They said not now; "not
 * now" is allowed to mean not now.
 *
 * Server component: pure render over a row the page already fetched.
 */
export default function OnboardingNudge({
  pet,
  progress,
}: {
  pet: Pick<Pet, "id" | "name">;
  progress: OnboardingProgress;
}) {
  const done = completedSteps(progress);
  const forLater = skippedSteps(progress);

  // Never started, and no reason to think they want to: the pet page has its own
  // first-run affordances and a second call to action on top of them is clutter.
  if (done.length === 0 && forLater.length === 0) return null;

  // Everything worked through. Silence is the correct end state, exactly as in
  // PetProgress.
  if (done.length === ONBOARDING_DATA_STEPS.length) return null;

  // Walk order, not "never opened first then passed over". The owner's mental
  // model of these blocks is the order they were asked in, and listing Basics
  // after Wearable because one was skipped and the other was not is a detail
  // about our data model leaking into their sentence.
  const stillOpen = ONBOARDING_DATA_STEPS.filter((s) => progress[s.key] !== "complete");
  // Settled = every block has an answer of some kind. Then this is a note about
  // what is there, with no push attached.
  const settled = isOnboardingSettled(progress);

  return (
    <section className="card mb-8 p-5" aria-labelledby="onboarding-nudge-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="onboarding-nudge-heading" className="text-sm font-medium">
          Setting up {pet.name}
        </h2>
        <p className="muted text-xs tabular-nums">
          {done.length} of {ONBOARDING_DATA_STEPS.length}
        </p>
      </div>

      {/* Decoration. The same information is in the count above and the sentence
          below, both of which read properly aloud. */}
      <div className="mt-3 flex gap-1" aria-hidden>
        {ONBOARDING_DATA_STEPS.map((s) => (
          <span
            key={s.key}
            className={`h-1.5 flex-1 rounded-full ${
              progress[s.key] === "complete" ? "bg-brand-500" : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      {done.length > 0 && (
        <p className="mt-3 text-sm leading-relaxed">
          <span className="muted">Filled in already: </span>
          {done.map((s) => s.title.toLowerCase()).join(", ")}.
        </p>
      )}

      {stillOpen.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] pt-4">
          <p className="min-w-0 flex-1 text-sm leading-relaxed">
            {stillOpen.map((s) => s.title).join(", ")}{" "}
            {stillOpen.length === 1 ? "is" : "are"} still open{" "}
            <span className="muted">
              — a minute each, whenever you feel like it. Nothing expires.
            </span>
          </p>
          {!settled && (
            <Link
              href={onboardingResumeHref(pet.id)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Pick up where you left off
            </Link>
          )}
        </div>
      )}

      {settled && stillOpen.length > 0 && (
        <p className="muted mt-3 text-xs leading-relaxed">
          You have been through all of it once — those blocks are here if you ever
          want them, and this note will not ask again.
        </p>
      )}
    </section>
  );
}
