"use client";

import { useState } from "react";
import { deletePet } from "@/app/actions";

/** Two-step delete. The first click only reveals the confirm field — deleting a
 *  pet takes its whole medical history with it and cannot be undone. */
export default function DeletePetButton({
  petId,
  petName,
}: {
  petId: string;
  petName: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="muted rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-red-400 hover:text-red-600"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={deletePet} className="card w-full max-w-xs p-3">
      <input type="hidden" name="pet_id" value={petId} />
      <p className="text-xs font-medium">Delete {petName}?</p>
      <p className="muted mt-1 text-xs leading-relaxed">
        This also removes every vaccination, medication, weight reading and vet
        visit on record. It cannot be undone.
      </p>
      <label htmlFor="confirm_name" className="muted mt-2 block text-xs">
        Type <span className="font-medium">{petName}</span> to confirm
      </label>
      <input
        id="confirm_name"
        name="confirm_name"
        required
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none focus:border-red-400"
      />
      <div className="mt-2 flex gap-2">
        <button className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">
          Delete
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="muted px-2 text-xs underline underline-offset-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
