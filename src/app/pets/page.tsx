import Link from "next/link";
import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { createClient, getUser } from "@/lib/supabase/server";
import { SPECIES_EMOJI, SPECIES_LABEL, ageFromBirthDate } from "@/lib/format";
import type { Pet } from "@/lib/types";

export default async function PetsPage() {
  const user = await getUser();
  const supabase = await createClient();
  const { data } = await supabase.from("pets").select("*").order("name");
  const pets = (data ?? []) as Pet[];

  return (
    <AppShell email={user?.email}>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Pets</h1>
        <Link
          href="/pets/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Add pet
        </Link>
      </div>

      {pets.length === 0 ? (
        <EmptyState
          title="No pets yet"
          body="Add a pet to start tracking their health record."
          href="/pets/new"
          cta="Add your first pet"
        />
      ) : (
        <ul className="card divide-y divide-[var(--border)]">
          {pets.map((pet) => (
            <li key={pet.id}>
              <Link href={`/pets/${pet.id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-brand-50/40">
                <span className="text-2xl">{SPECIES_EMOJI[pet.species] ?? "🐾"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{pet.name}</p>
                  <p className="muted truncate text-xs">
                    {[SPECIES_LABEL[pet.species], pet.breed, ageFromBirthDate(pet.birth_date)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="muted text-sm">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
