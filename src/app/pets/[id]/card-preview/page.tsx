// TEMPORARY verification route — deleted before commit.
import AppShell from "@/components/AppShell";
import PetProfileCard from "@/components/PetProfileCard";
import { createClient, getUser } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Pet } from "@/lib/types";

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();
  const { data } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Pet;
  return (
    <AppShell email={user?.email}>
      <PetProfileCard petId={p.id} petName={p.name} />
    </AppShell>
  );
}
