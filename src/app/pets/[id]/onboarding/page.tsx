import { notFound, redirect } from "next/navigation";
import { loadOnboarding } from "@/lib/onboarding-store";
import { onboardingHref, resumeStepKey } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

/**
 * `/pets/[id]/onboarding` — the resume door.
 *
 * Everything that wants to send an owner back into the walk links HERE rather
 * than at a specific step, because the honest answer to "where was I" is only
 * knowable at click time. The pet page is cached, and by the time somebody taps
 * a link rendered on it they may have finished two more blocks in another tab.
 * Resolving server-side on the way through means no link in the app can ever be
 * stale, and a plain <a> works without JavaScript.
 *
 * Redirects, never renders. `resumeStepKey` always returns a real step, so this
 * cannot bounce anybody into a 404.
 */
export default async function OnboardingResumePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("id").eq("id", id).maybeSingle();
  if (!pet) notFound();

  const { progress, lastStep } = await loadOnboarding(supabase, id);
  redirect(onboardingHref(id, resumeStepKey(progress, lastStep)));
}
