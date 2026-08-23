import Link from "next/link";
import { notFound } from "next/navigation";
import OnboardingNav from "@/components/OnboardingNav";
import OnboardingStepBody from "@/components/OnboardingStepBody";
import { loadOnboarding } from "@/lib/onboarding-store";
import {
  isStepKey,
  nextStep,
  onboardingHref,
  previousStep,
  stepByKey,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import type { Pet } from "@/lib/types";

/**
 * One step of the walkthrough.
 *
 * UNKNOWN STEPS 404, THEY DO NOT THROW
 * `/pets/x/onboarding/rutabaga` is a URL somebody will type, a link that will
 * rot, and a step key we will eventually rename. Every one of those has to end
 * in the ordinary not-found page. So the segment is narrowed through
 * `isStepKey` BEFORE anything indexes into the step list — `stepByKey` is only
 * reachable with a value the type system already knows is a step, and there is
 * no path here that can dereference `undefined`. Same for the pet: a stranger's
 * id is filtered out by RLS, comes back as no row, and 404s rather than
 * revealing that it exists.
 *
 * The nearest not-found boundary is the root one, so a 404 here replaces the
 * onboarding shell entirely instead of rendering a step indicator around an
 * error.
 */
export default async function OnboardingStepPage({
  params,
}: {
  params: Promise<{ id: string; step: string }>;
}) {
  const { id, step: rawStep } = await params;
  if (!isStepKey(rawStep)) notFound();

  const supabase = await createClient();
  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();
  const p = pet as Pet;

  const { progress } = await loadOnboarding(supabase, id);

  const step = stepByKey(rawStep);
  const previous = previousStep(rawStep);
  const upcoming = nextStep(rawStep);

  // Back from the first block leaves the walk rather than dead-ending. It is a
  // link either way, and it records nothing — going back to check what you put
  // in block one cannot cost you block two.
  const backHref = previous ? onboardingHref(p.id, previous.key) : `/pets/${p.id}`;
  const backLabel = previous ? previous.title : p.name;

  // "Finish" on the last block that asks anything, because the only thing after
  // it is the summary screen. Calling that one "Next" would promise a sixth
  // question that does not exist.
  const nextLabel = upcoming && upcoming.terminal ? "Finish" : "Next";

  return (
    <section aria-labelledby="onboarding-step-heading">
      {!step.terminal && (
        <header className="mb-5">
          <h2
            id="onboarding-step-heading"
            className="text-lg font-semibold tracking-tight"
          >
            {step.title}
          </h2>
          <p className="muted mt-1 text-sm leading-relaxed">{step.purpose}</p>
        </header>
      )}

      <OnboardingStepBody step={step} pet={p} progress={progress} />

      {step.terminal ? (
        // The summary screen carries its own way onward and has nothing to
        // record, so it gets a plain way back instead of Back/Skip/Next.
        // "Skip on every step" is about the blocks that ask something; there is
        // nothing here to skip.
        <div className="mt-8 border-t border-[var(--border)] pt-4">
          <Link
            href={backHref}
            className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-brand-500 hover:text-[var(--brand-text)]"
          >
            ← {backLabel}
          </Link>
        </div>
      ) : (
        <OnboardingNav
          petId={p.id}
          petName={p.name}
          step={step.key}
          backHref={backHref}
          backLabel={backLabel}
          nextLabel={nextLabel}
        />
      )}
    </section>
  );
}
