import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import MediaSection from "@/components/MediaSection";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Pet } from "@/lib/types";

export const metadata = { title: "Media history — FurIndex" };

/**
 * A page of its own for the media history.
 *
 * The same <MediaSection> is meant to sit on the pet page too (see the wiring
 * note in the PR); this route exists because the block is long — a capture
 * form plus a timeline of video — and on a phone it is a lot to scroll past on
 * the way to the vaccination table. It also gives the feature a linkable URL,
 * which "the bit two thirds of the way down /pets/<id>" is not.
 */
export default async function PetMediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();
  const p = pet as Pet;

  return (
    <AppShell email={user?.email}>
      <Link
        href={`/pets/${p.id}`}
        className="muted inline-flex min-h-11 items-center text-sm hover:text-[var(--brand-text)]"
      >
        ← {p.name}
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight">
        {p.name}&rsquo;s media history
      </h1>
      <MediaSection petId={p.id} />
    </AppShell>
  );
}
