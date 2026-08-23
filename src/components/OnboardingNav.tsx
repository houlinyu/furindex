"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  markStepComplete,
  skipStep,
  type OnboardingState,
} from "@/app/onboarding-actions";
import type { OnboardingStepKey } from "@/lib/onboarding";

/**
 * Back / Skip / Next, under every step of the walkthrough.
 *
 * DESIGN RULES, all three of them load-bearing:
 *
 * 1. Skip is not a secondary escape hatch hidden behind a link — it sits next
 *    to Next, at the same size, worded without apology. Forced completion is
 *    what kills onboarding conversion, and a Skip that looks like giving up
 *    gets treated like giving up: the owner closes the tab instead.
 * 2. Both submits use useActionState and disable while pending, so a double
 *    tap on a slow connection cannot record the same step twice or race two
 *    redirects against each other.
 * 3. If the write fails, the owner still gets out. The action hands back
 *    `continueHref` with its error and we offer it as a plain link. Our
 *    database having a bad minute must not become a wall in front of somebody
 *    who was only trying to say "not now".
 *
 * Back is a link, not an action: it records nothing, so nothing a step has
 * already saved can be lost by going back to look at it.
 */
export default function OnboardingNav({
  petId,
  petName,
  step,
  backHref,
  backLabel,
  nextLabel,
}: {
  petId: string;
  petName: string;
  step: OnboardingStepKey;
  backHref: string;
  backLabel: string;
  /** "Next" on the way through, "Finish" on the last block that asks anything. */
  nextLabel: string;
}) {
  const [skipState, skipAction, skipping] = useActionState<OnboardingState, FormData>(
    skipStep,
    {}
  );
  const [nextState, nextAction, advancing] = useActionState<OnboardingState, FormData>(
    markStepComplete,
    {}
  );

  const pending = skipping || advancing;
  const state = skipState.error ? skipState : nextState;

  return (
    <div className="mt-8 border-t border-[var(--border)] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={backHref}
          className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-brand-500 hover:text-[var(--brand-text)]"
        >
          ← {backLabel}
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <form action={skipAction}>
            <input type="hidden" name="pet_id" value={petId} />
            <input type="hidden" name="step" value={step} />
            <button
              type="submit"
              disabled={pending}
              className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-brand-500 hover:text-[var(--brand-text)] disabled:opacity-60"
            >
              {skipping ? "Skipping…" : "Skip for now"}
            </button>
          </form>

          <form action={nextAction}>
            <input type="hidden" name="pet_id" value={petId} />
            <input type="hidden" name="step" value={step} />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {advancing ? "Saving…" : nextLabel}
            </button>
          </form>
        </div>
      </div>

      {state.error && (
        <p className="mt-3 text-sm" role="status">
          {state.error}{" "}
          {state.continueHref && (
            <Link href={state.continueHref} className="underline underline-offset-4">
              Carry on anyway →
            </Link>
          )}
        </p>
      )}

      <p className="muted mt-3 text-xs leading-relaxed">
        Every block here is optional. Skipping one keeps your place and leaves
        the block open — it is still there on {petName}&apos;s page whenever you
        want it.
      </p>
    </div>
  );
}
