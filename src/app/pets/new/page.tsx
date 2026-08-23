import Link from "next/link";
import AppShell from "@/components/AppShell";
import { getUser } from "@/lib/supabase/server";
import { createPet } from "@/app/actions";
import { SPECIES_LABEL } from "@/lib/format";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500";

export default async function NewPetPage() {
  const user = await getUser();

  return (
    <AppShell email={user?.email}>
      <Link href="/pets" className="muted text-sm hover:text-brand-600">
        ← Pets
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold tracking-tight">Add a pet</h1>

      <form action={createPet} className="card space-y-4 p-6">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">
            Name <span className="text-red-500">*</span>
          </label>
          <input id="name" name="name" required maxLength={80} className={field} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="species" className="mb-1 block text-sm font-medium">Species</label>
            <select id="species" name="species" defaultValue="dog" className={field}>
              {Object.entries(SPECIES_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sex" className="mb-1 block text-sm font-medium">Sex</label>
            <select id="sex" name="sex" defaultValue="unknown" className={field}>
              <option value="unknown">Unknown</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>
          <div>
            <label htmlFor="breed" className="mb-1 block text-sm font-medium">Breed</label>
            <input id="breed" name="breed" maxLength={80} className={field} />
          </div>
          <div>
            <label htmlFor="birth_date" className="mb-1 block text-sm font-medium">Birth date</label>
            <input id="birth_date" name="birth_date" type="date" className={field} />
          </div>
        </div>

        <div>
          <label htmlFor="microchip_id" className="mb-1 block text-sm font-medium">Microchip ID</label>
          <input id="microchip_id" name="microchip_id" maxLength={40} className={field} />
        </div>

        <div>
          <label htmlFor="notes" className="mb-1 block text-sm font-medium">Notes</label>
          <textarea id="notes" name="notes" rows={3} className={field} />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Save pet
        </button>
      </form>
    </AppShell>
  );
}
