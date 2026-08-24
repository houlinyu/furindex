import Link from "next/link";
import AppShell from "@/components/AppShell";
import NewPetPrefill from "@/components/NewPetPrefill";
import { getUser } from "@/lib/supabase/server";

export const metadata = { title: "Add a pet — FurIndex" };

export default async function NewPetPage() {
  const user = await getUser();

  return (
    <AppShell email={user?.email}>
      <Link href="/pets" className="muted inline-flex min-h-11 items-center text-sm hover:text-brand-600">
        ← Pets
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight">Add a pet</h1>
      {/* The form itself takes plain props; this wrapper is the only thing that
          knows the landing-page funnel exists, so the form stays usable (and
          testable) with no funnel at all. */}
      <NewPetPrefill />
    </AppShell>
  );
}
