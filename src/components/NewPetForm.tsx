"use client";

import { useActionState, useId } from "react";
import { createPet, type PetFormState } from "@/app/actions";
import BreedInput from "@/components/BreedInput";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

export default function NewPetForm() {
  const [state, formAction, pending] = useActionState<PetFormState, FormData>(
    createPet,
    {}
  );
  const today = new Date().toISOString().slice(0, 10);
  const v = state.values ?? {};
  const errorId = useId();
  // createPet returns one form-level message, so the link goes on the only
  // required field.
  const errorLink = state.error
    ? { "aria-invalid": true as const, "aria-describedby": errorId }
    : {};

  return (
    <form action={formAction} className="card space-y-4 p-6">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={80}
          defaultValue={v.name ?? ""}
          className={field}
          {...errorLink}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BreedInput defaultSpecies={v.species || "dog"} defaultBreed={v.breed ?? ""} />

        <div>
          <label htmlFor="sex" className="mb-1 block text-sm font-medium">
            Sex
          </label>
          <select id="sex" name="sex" defaultValue={v.sex || "unknown"} className={field}>
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
            defaultValue={v.birth_date ?? ""}
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
          defaultValue={v.microchip_id ?? ""}
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
          defaultValue={v.notes ?? ""}
          className={field}
        />
      </div>

      {state.error && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save pet"}
      </button>
    </form>
  );
}
