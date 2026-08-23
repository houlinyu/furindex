import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import EditPetForm from "@/components/EditPetForm";
import { createClient, getUser } from "@/lib/supabase/server";
import { signedPetPhotoUrl } from "@/lib/photos";
import type { Pet } from "@/lib/types";

export const metadata = { title: "Edit pet — FurIndex" };

export default async function EditPetPage({
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
  const photoUrl = await signedPetPhotoUrl(supabase, p.photo_url);

  return (
    <AppShell email={user?.email}>
      <Link href={`/pets/${p.id}`} className="muted text-sm hover:text-brand-600">
        ← {p.name}
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight">Edit {p.name}</h1>
      <EditPetForm pet={p} photoUrl={photoUrl} />
    </AppShell>
  );
}
