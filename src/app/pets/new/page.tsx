import Link from "next/link";
import AppShell from "@/components/AppShell";
import NewPetForm from "@/components/NewPetForm";
import { getUser } from "@/lib/supabase/server";

export const metadata = { title: "Add a pet — FurIndex" };

export default async function NewPetPage() {
  const user = await getUser();

  return (
    <AppShell email={user?.email}>
      <Link href="/pets" className="muted text-sm hover:text-brand-600">
        ← Pets
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight">Add a pet</h1>
      <NewPetForm />
    </AppShell>
  );
}
