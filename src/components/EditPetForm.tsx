"use client";

import Link from "next/link";
import { useActionState } from "react";
import { updatePet, type PetFormState } from "@/app/pet-actions";
import BreedInput from "@/components/BreedInput";
import PetPhotoUpload from "@/components/PetPhotoUpload";
import type { Pet } from "@/lib/types";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-brand-500";

export default function EditPetForm({
  pet,
  photoUrl = null,
}: {
  pet: Pet;
  /** Signed URL for the current photo — see signedPetPhotoUrl(). */
  photoUrl?: string | null;
}) {
  const [state, formAction, pending] = useActionState<PetFormState, FormData>(
    updatePet,
    {}
  );
  const today = new Date().toISOString().slice(0, 10);

  // After a rejected submit the action echoes back what was typed; before that
  // there is nothing to echo, so fall back to what's on record.
  const v = state.values ?? {};
  const val = (key: keyof Pet, fallback = "") =>
    v[key] ?? (pet[key] == null ? fallback : String(pet[key]));

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <input type="hidden" name="pet_id" value={pet.id} />

      {/* Photo saves on its own, so it survives a failed submit of the rest. */}
      <PetPhotoUpload pet={pet} photoUrl={photoUrl} />

      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          defaultValue={val("name")}
          className={field}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BreedInput
          defaultSpecies={val("species", "dog") || "dog"}
          defaultBreed={val("breed")}
        />

        <div>
          <label htmlFor="sex" className="mb-1 block text-sm font-medium">
            Sex
          </label>
          <select
            id="sex"
            name="sex"
            defaultValue={val("sex", "unknown") || "unknown"}
            className={field}
          >
            <option value="unknown">Unknown</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </div>

        <div>
          <label htmlFor="birth_date" className="mb-1 block text-sm font-medium">
            Birth date
          </label>
          <input
            id="birth_date"
            name="birth_date"
            type="date"
            max={today}
            defaultValue={val("birth_date")}
            className={field}
          />
          <p className="muted mt-1 text-xs">Approximate is fine. Leave blank if unknown.</p>
        </div>
      </div>

      <div>
        <label htmlFor="microchip_id" className="mb-1 block text-sm font-medium">
          Microchip ID
        </label>
        <input
          id="microchip_id"
          name="microchip_id"
          maxLength={40}
          defaultValue={val("microchip_id")}
          className={field}
        />
      </div>

      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={val("notes")}
          className={field}
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link
          href={`/pets/${pet.id}`}
          className="muted text-sm underline underline-offset-4 hover:text-brand-600"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
