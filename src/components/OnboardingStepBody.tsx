import Link from "next/link";
import {
  ONBOARDING_DATA_STEPS,
  completedSteps,
  onboardingHref,
  percentComplete,
  skippedSteps,
  openSteps,
  type OnboardingProgress,
  type OnboardingStep,
} from "@/lib/onboarding";
import type { Pet } from "@/lib/types";

/**
 * The body of one onboarding step — everything between the step indicator and
 * the Back / Skip / Next row.
 *
 * ============================================================================
 * THIS IS THE ONE FILE THE STEP-CONTENT BRANCHES NEED TO TOUCH.
 *
 * The questionnaire (`ProfileQuiz`) and the vaccine block (`VaccineBlock`) are
 * being built in parallel branches. When one lands, drop it in here:
 *
 *   import ProfileQuiz from "@/components/ProfileQuiz";
 *   ...
 *   case "behavior-health":
 *     return <ProfileQuiz petId={pet.id} block="behavior-health" />;
 *
 * The contract the shell offers a step body:
 *   - It is rendered inside a server component, so a client component is fine,
 *     an async server component is fine, and it gets `pet` and `progress` for
 *     free. Anything it needs beyond that it should fetch itself.
 *   - It owns its own saving. Save as the owner goes — per question, per block,
 *     whatever fits — never only at the end. The shell's Next button records
 *     that the block was worked through; it does NOT save the block's answers.
 *   - To record the step the moment its own save succeeds, post to
 *     `markStepComplete` from "@/app/onboarding-actions" with hidden fields
 *     `pet_id`, `step` and `stay="1"` — `stay` keeps the owner on the page
 *     instead of advancing.
 *   - It must not gate anything. No required fields, no blocking validation,
 *     no "you must answer this to continue". Every screen is skippable and the
 *     Skip button below the body must always mean what it says.
 * ============================================================================
 */
export default function OnboardingStepBody({
  step,
  pet,
  progress,
}: {
  step: OnboardingStep;
  pet: Pet;
  progress: OnboardingProgress;
}) {
  switch (step.key) {
    // ---------------------------------------------------------- ProfileQuiz --
    // Three of the seven questionnaire blocks surface as their own steps here.
    case "basics":
      return (
        <Placeholder
          step={step}
          awaiting="ProfileQuiz"
          asks="Name, species, breed and rough birth date, confirmed or corrected."
        />
      );
    case "behavior-health":
      return (
        <Placeholder
          step={step}
          awaiting="ProfileQuiz"
          asks="Personality, health history, nutrition, routine and environment — the questionnaire's middle blocks."
        />
      );
    case "wearable":
      return (
        <Placeholder
          step={step}
          awaiting="ProfileQuiz"
          asks="Whether there is already a collar tracker, and whether one would be welcome."
        />
      );

    // --------------------------------------------------------- VaccineBlock --
    case "vaccines":
      return (
        <Placeholder
          step={step}
          awaiting="VaccineBlock"
          asks="Which vaccinations they have had, and when the next is due."
        />
      );

    // ------------------------------------------------------------ unclaimed --
    case "media":
      return (
        <Placeholder
          step={step}
          awaiting={null}
          asks="A profile photo, and a picture of any paperwork worth keeping."
        />
      );

    // ------------------------------------------------------------- terminal --
    case "dashboard":
      return <Finish pet={pet} progress={progress} />;
  }
}

/**
 * Stands in for a step whose content has not landed yet.
 *
 * Marked unmistakably as scaffolding — dashed border, the word placeholder, the
 * name of the component that will replace it — because the failure mode of a
 * pretty placeholder is that somebody demos it as if it were the feature.
 */
function Placeholder({
  step,
  awaiting,
  asks,
}: {
  step: OnboardingStep;
  /** The component expected to replace this, if a branch has claimed it. */
  awaiting: string | null;
  /** What this block will ask, in the owner's language. */
  asks: string;
}) {
  return (
    <div className="rounded-[0.875rem] border border-dashed border-[var(--border)] p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand-text)]">
        Placeholder — content not built yet
      </p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">{step.title}</h2>
      <p className="muted mt-1 text-sm leading-relaxed">{asks}</p>
      <dl className="muted mt-4 grid gap-1 text-xs">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">Feeds</dt>
          <dd className="min-w-0">{step.feeds}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">Waiting on</dt>
          <dd className="min-w-0">
            {awaiting ? (
              <code>{awaiting}</code>
            ) : (
              "No branch has claimed this block yet."
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">Drop-in</dt>
          <dd className="min-w-0">
            <code>src/components/OnboardingStepBody.tsx</code>, case{" "}
            <code>&quot;{step.key}&quot;</code>
          </dd>
        </div>
      </dl>
      <p className="muted mt-4 text-xs leading-relaxed">
        The walk itself works: Skip for now and {step.key === "wearable" ? "Finish" : "Next"} both
        record where you got to, and Back never loses anything.
      </p>
    </div>
  );
}

/**
 * The last screen. Not a scorecard.
 *
 * Same constraints as PetProgress: it counts what is there, it never names an
 * absence as a lack, there is no red anywhere in it, and a block that was
 * passed over is described as still open rather than as missed. An owner who
 * skipped all five blocks should reach this screen and feel finished, because
 * they are — they told us what they wanted to tell us.
 */
function Finish({ pet, progress }: { pet: Pet; progress: OnboardingProgress }) {
  const done = completedSteps(progress);
  const forLater = skippedSteps(progress);
  const open = openSteps(progress);
  const stillOpen = [...open, ...forLater];
  const pct = percentComplete(progress);

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold tracking-tight">
        That&apos;s {pet.name} set up.
      </h2>

      {done.length > 0 ? (
        <>
          <p className="mt-2 text-sm leading-relaxed">
            <span className="muted">On file already: </span>
            {done.map((s) => s.title.toLowerCase()).join(", ")}.
          </p>
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
          <p className="muted mt-2 text-xs tabular-nums">
            {done.length} of {ONBOARDING_DATA_STEPS.length} blocks filled in · {pct}%
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed">
          You have a record for {pet.name}, which is the part that matters. The
          rest of it fills itself in as you go.
        </p>
      )}

      {stillOpen.length > 0 && (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="text-sm leading-relaxed">
            {stillOpen.map((s) => s.title).join(", ")}{" "}
            {stillOpen.length === 1 ? "is" : "are"} still open — a minute each,
            and nothing expires.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {stillOpen.map((s) => (
              <Link
                key={s.key}
                href={onboardingHref(pet.id, s.key)}
                className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs hover:border-brand-500 hover:text-[var(--brand-text)]"
              >
                {s.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <Link
          href={`/pets/${pet.id}`}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Go to {pet.name}&apos;s page
        </Link>
      </div>
    </div>
  );
}
