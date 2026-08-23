"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveStepStatus } from "@/lib/onboarding-store";
import {
  isStepKey,
  nextStep,
  onboardingHref,
  stepByKey,
  type OnboardingStepKey,
  type OnboardingStepStatus,
} from "@/lib/onboarding";

/**
 * Onboarding step transitions.
 *
 * Two rules this file exists to obey, both learned the hard way here:
 *   1. Actions RETURN errors, they never throw. A thrown server action is a
 *      full-page "Application error" and the owner loses what they typed.
 *   2. A "use server" module may export ONLY async functions — no consts, no
 *      objects. The step list and every pure helper live in src/lib/onboarding.ts;
 *      scripts/check-server-actions.mjs fails the build if that slips.
 *
 * And one rule from the product brief: **nothing here may trap the owner.**
 * Skipping is a first-class answer, so when the write fails the action still
 * hands back the URL of the next step (`continueHref`) and the UI offers it.
 * An owner who cannot get past block two because our database is having a bad
 * day is an owner who does not come back.
 *
 * There is deliberately no `resumeOnboarding` action. "Where was I" is a GET,
 * not a mutation: /pets/[id]/onboarding resolves it server-side on the way
 * through, which works without JavaScript and cannot go stale the way a link
 * baked at render time can. Exporting an action for it would have added a
 * callable endpoint that did nothing a plain link doesn't.
 */
export type OnboardingState = {
  error?: string;
  ok?: boolean;
  /**
   * Where the owner was heading. Set alongside `error` so the nav can offer to
   * move on anyway — onboarding is not a gate, and least of all a gate on our
   * own failures.
   */
  continueHref?: string;
};

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Both the walk and the pet page show progress, so both go stale on a write. */
function refresh(petId: string) {
  revalidatePath(`/pets/${petId}`, "page");
  revalidatePath(`/pets/${petId}/onboarding`, "layout");
}

/**
 * The shared body of "complete" and "skip". They differ by one stored word;
 * everything else — validation, the write, where the owner goes next, what
 * happens when the write fails — is identical, and keeping it identical is the
 * point. A skip that behaved differently on failure would quietly become a gate.
 */
async function recordStep(
  formData: FormData,
  status: OnboardingStepStatus
): Promise<OnboardingState> {
  const petId = text(formData, "pet_id");
  const rawStep = text(formData, "step");
  if (!petId) return { error: "Missing pet." };
  if (!isStepKey(rawStep)) return { error: "That step doesn't exist." };

  const step: OnboardingStepKey = rawStep;
  if (stepByKey(step).terminal) {
    // The last screen is a destination, not a question. Nothing to record.
    return { error: "There's nothing to record on that screen." };
  }

  const after = nextStep(step);
  const continueHref = after ? onboardingHref(petId, after.key) : `/pets/${petId}`;

  const { supabase, user } = await requireUser();
  const { error } = await saveStepStatus(supabase, {
    petId,
    ownerId: user.id,
    step,
    status,
  });
  if (error) return { error, continueHref };

  refresh(petId);

  // A content block saving its own answers asks to stay put; the walkthrough's
  // own Next/Skip buttons move on.
  if (text(formData, "stay") === "1") return { ok: true };
  redirect(continueHref);
}

/**
 * "I worked through this block."
 *
 * Also the hook for the step content itself: ProfileQuiz / VaccineBlock can
 * call this with `stay=1` the moment their own save succeeds, so progress is
 * recorded save-as-you-go rather than only when the owner presses Next.
 */
export async function markStepComplete(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  return recordStep(formData, "complete");
}

/**
 * "Not now."
 *
 * Stored as an answer in its own right rather than left blank, so the pet page
 * can tell "asked and passed" from "never asked" and pitch its nudge
 * accordingly. Skipping is never penalised and never re-prompted mid-walk.
 */
export async function skipStep(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  return recordStep(formData, "skipped");
}
