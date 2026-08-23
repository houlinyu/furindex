import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import OnboardingSteps from "@/components/OnboardingSteps";
import { loadOnboarding } from "@/lib/onboarding-store";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Pet } from "@/lib/types";

/**
 * The shell every onboarding step is rendered inside.
 *
 * WHAT LIVES HERE AND WHY
 * The layout owns the chrome that must not flicker or reset as the owner moves
 * between blocks: the app frame, the way back out, the pet's name, and the step
 * indicator. A layout is not re-mounted when only the child segment changes, so
 * the indicator genuinely persists — it does not re-fetch, re-animate or lose
 * focus on every Next.
 *
 * It deliberately does NOT own the step body. The body is `[step]/page.tsx`,
 * which is the segment that changes; keeping them separate is what makes the
 * indicator persistent in the first place, and it is what lets an unknown step
 * 404 without taking the shell down with it.
 *
 * The layout cannot see its child's params — that is a real App Router
 * constraint, not an oversight — so `OnboardingSteps` reads the current step
 * from the router segment instead. See the comment at the top of that file.
 *
 * ONE QUERY EACH, ON PURPOSE
 * The layout and the page both look up the pet and the progress row. That is
 * two cheap indexed reads rather than one, and the alternative — threading them
 * through React context or a module-level cache — would either need a client
 * boundary around server data or reintroduce exactly the cross-request leak
 * `createClient` is written to avoid.
 */
export const metadata = { title: "Setting up — FurIndex" };

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase
    .from("pets")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!pet) notFound();
  const p = pet as Pick<Pet, "id" | "name">;

  // Never throws: a pet with no row yet, and a database this table has not been
  // migrated into yet, both come back as "nothing recorded". See onboarding-store.
  const { progress, stored } = await loadOnboarding(supabase, id);

  return (
    <AppShell email={user?.email}>
      <Link href={`/pets/${p.id}`} className="muted inline-flex min-h-11 items-center text-sm hover:text-brand-600">
        ← {p.name}
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-semibold tracking-tight">
        Setting up {p.name}
      </h1>
      <p className="muted mb-6 text-sm leading-relaxed">
        Five short blocks. Answer what you know, skip what you don&apos;t — every
        one of them is optional and you can come back to any of them later.
      </p>

      <OnboardingSteps petId={p.id} progress={progress} />

      {/* Said out loud rather than swallowed. Without the table the walk still
          works end to end, but nothing is remembered, and an owner who filled
          in three blocks and found them gone would rightly never trust it
          again. Neutral, not an alarm: it is our problem, not theirs. */}
      {!stored && (
        <p className="muted mb-6 rounded-lg border border-dashed border-[var(--border)] p-3 text-xs leading-relaxed">
          Heads up: this environment hasn&apos;t had{" "}
          <code>supabase/schema.sql</code> applied yet, so your place in this
          walkthrough won&apos;t be remembered between visits. Everything each
          block saves for {p.name} is unaffected.
        </p>
      )}

      {children}
    </AppShell>
  );
}
