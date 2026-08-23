"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import {
  ONBOARDING_STEPS,
  isStepKey,
  onboardingHref,
  stepNumber,
  type OnboardingProgress,
} from "@/lib/onboarding";

/**
 * The persistent step indicator across the top of the walkthrough.
 *
 * Lives in the onboarding LAYOUT, so it is mounted once and survives every
 * step transition rather than being torn down and rebuilt per page. That is
 * also why it reads the current step from `useSelectedLayoutSegment()` instead
 * of taking it as a prop: a layout in the App Router is not re-rendered with
 * its child's params, and the only honest way for it to know which step is on
 * screen is to ask the router. The segment is narrowed through `isStepKey`, so
 * an unknown one (which the page 404s on) simply highlights nothing rather
 * than indexing off the end of the list.
 *
 * Every dot is a link, on purpose. The owner can see the whole shape of what is
 * being asked before they start, jump straight to the block they care about,
 * and come back to one they passed on — none of which is possible in a wizard
 * that only moves forwards, and all of which is the difference between a walk
 * and a funnel.
 *
 * TONE, which matches PetProgress:
 *   - a passed-over block reads "for later", never "skipped", "missed" or
 *     "incomplete", and never in red. Nothing here is a failure state.
 *   - a block nobody has answered yet is simply not annotated. Naming an
 *     absence is what turns a map into a chore list.
 */
export default function OnboardingSteps({
  petId,
  progress,
}: {
  petId: string;
  progress: OnboardingProgress;
}) {
  const segment = useSelectedLayoutSegment();
  const current = isStepKey(segment) ? segment : null;

  const total = ONBOARDING_STEPS.length;
  const position = current ? stepNumber(current) : 0;

  return (
    <nav aria-label="Onboarding steps" className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {ONBOARDING_STEPS.map((step) => {
          const isCurrent = step.key === current;
          const status = progress[step.key];
          const done = status === "complete";
          const forLater = status === "skipped";

          return (
            <li key={step.key} className="flex min-w-0 items-center">
              <Link
                href={onboardingHref(petId, step.key)}
                aria-current={isCurrent ? "step" : undefined}
                className={`inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-xs ${
                  isCurrent
                    ? "font-medium text-[var(--brand-text)]"
                    : "muted hover:text-[var(--brand-text)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums ${
                    done
                      ? "border-brand-500 bg-brand-500 text-white"
                      : isCurrent
                        ? "border-brand-500 text-[var(--brand-text)]"
                        : "border-[var(--border)]"
                  }`}
                >
                  {done ? "✓" : stepNumber(step.key)}
                </span>
                {/* On a narrow screen only the step you are on is named; the
                    rest stay as numbers so the whole walk still fits on one
                    line instead of wrapping into a wall. */}
                <span className={`truncate ${isCurrent ? "inline" : "hidden sm:inline"}`}>
                  {step.title}
                </span>
                <span className="sr-only">
                  {done
                    ? " — done"
                    : forLater
                      ? " — saved for later"
                      : ""}
                </span>
                {forLater && (
                  <span aria-hidden className="muted hidden text-[11px] sm:inline">
                    · for later
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ol>

      {position > 0 && (
        <p className="muted mt-1 px-2 text-xs tabular-nums">
          Step {position} of {total}
        </p>
      )}
    </nav>
  );
}
