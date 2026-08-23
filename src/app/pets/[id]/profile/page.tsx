import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import ProfileQuiz from "@/components/ProfileQuiz";
import ProfileReview from "@/components/ProfileReview";
import { clampBlockIndex, profileProgress } from "@/lib/pet-profile";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Pet, PetProfile } from "@/lib/types";

export const metadata = { title: "Pet profile — FurIndex" };

/**
 * The questionnaire lives on its own route rather than inside the pet page.
 *
 * WHY: the block being shown is `?block=n` in the URL, which is what makes the
 * flow survive a reload, a back button and a shared link, with no client-side
 * state to lose. The pet page is already long; a seven-screen flow embedded in
 * it would fight the scroll position on every step.
 */
export default async function PetProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ block?: string; done?: string; new?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();
  const p = pet as Pet;

  const { data, error } = await supabase
    .from("pet_profiles")
    .select("*")
    .eq("pet_id", id)
    .maybeSingle();

  // The table is created by a migration the maintainer applies by hand, so a
  // checkout of this branch can legitimately be running against a database that
  // doesn't have it yet. That is a missing migration, not a broken page — the
  // questions still render and the quiz says plainly that nothing will save.
  // 42P01 is Postgres "undefined table"; PGRST205 is PostgREST's schema cache
  // reporting the same thing.
  const storageReady = !error || !["42P01", "PGRST205"].includes(error.code ?? "");
  const profile = (data as PetProfile | null) ?? null;
  const progress = profileProgress(profile);

  // The review screen is both the end of the flow and what reopening a
  // finished questionnaire should show. Dropping someone who has already been
  // through all seven blocks back onto block 1 would read as "do it again".
  if (sp.done !== undefined || (sp.block === undefined && progress.complete)) {
    return (
      <AppShell email={user?.email}>
        <ProfileReview pet={p} profile={profile} />
      </AppShell>
    );
  }

  // No ?block= means "carry on where you left off". Someone who answered three
  // blocks last week should not have to tap past them again.
  const blockIndex =
    sp.block !== undefined ? clampBlockIndex(sp.block) : progress.nextIndex;

  return (
    <AppShell email={user?.email}>
      <Link
        href={`/pets/${p.id}`}
        className="muted inline-flex min-h-11 items-center text-sm hover:text-[var(--brand-text)]"
      >
        ← {p.name}
      </Link>
      <div className="mt-3">
        <ProfileQuiz
          pet={p}
          profile={profile}
          blockIndex={blockIndex}
          isNew={sp.new !== undefined}
          storageReady={storageReady}
        />
      </div>
    </AppShell>
  );
}
