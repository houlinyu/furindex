"use client";

import { useActionState, useId, useState } from "react";
import { createPet, type PetFormState } from "@/app/actions";
import BreedInput from "@/components/BreedInput";
import { SPECIES_LABEL } from "@/lib/format";
import type { FunnelSource } from "@/lib/funnel-intent";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

/**
 * Optional starting values, carried in from the landing-page funnel.
 *
 * Every field is a SUGGESTION. It arrives from user-editable client state, it
 * may be the output of a photo model that was only fairly sure, and it may be
 * about a different animal entirely if someone shared a tab. So it is shown
 * with where it came from and a one-click way to drop it, and it is never
 * presented as something we know.
 */
export type PetPrefill = {
  species?: string;
  breed?: string | null;
  /** A small data-URL preview of the photo they dropped. Display only. */
  photo?: string | null;
  source?: FunnelSource;
};

export default function NewPetForm({
  prefill = null,
  onClearPrefill,
  onPrefillConsumed,
}: {
  prefill?: PetPrefill | null;
  /** The visitor rejected the suggestion — forget it everywhere, not just here. */
  onClearPrefill?: () => void;
  /** The suggestion has been submitted; it must not pre-fill the next pet too. */
  onPrefillConsumed?: () => void;
} = {}) {
  const [state, formAction, pending] = useActionState<PetFormState, FormData>(
    createPet,
    {}
  );
  const today = new Date().toISOString().slice(0, 10);
  const v = state.values ?? {};
  const errorId = useId();

  // Held in state so "Clear" can remove it without a round trip. The counter
  // remounts BreedInput — and only BreedInput — so clearing resets the two
  // pre-filled fields without discarding a name the visitor has already typed.
  const [suggestion, setSuggestion] = useState<PetPrefill | null>(prefill);
  const [breedKey, setBreedKey] = useState(0);

  // createPet returns one form-level message, so the link goes on the only
  // required field.
  const errorLink = state.error
    ? { "aria-invalid": true as const, "aria-describedby": errorId }
    : {};

  // A failed submit round-trips what was actually typed; that always wins over
  // the original suggestion.
  const speciesDefault = v.species || suggestion?.species || "dog";
  const breedDefault = v.breed ?? suggestion?.breed ?? "";

  const suggestedSpeciesLabel = suggestion?.species
    ? SPECIES_LABEL[suggestion.species] ?? null
    : null;

  function clearPrefill() {
    setSuggestion(null);
    setBreedKey((n) => n + 1);
    onClearPrefill?.();
  }

  return (
    <form
      action={formAction}
      // Once these values are on their way to the server they have served their
      // purpose. Leaving them in storage would pre-fill the NEXT pet with this
      // one's species and breed.
      onSubmit={() => onPrefillConsumed?.()}
      className="card space-y-4 p-6"
    >
      {suggestion && (
        <div className="rounded-lg border border-brand-300 bg-brand-50/50 p-4 dark:border-brand-500/50 dark:bg-brand-500/10">
          <div className="flex items-start gap-3">
            {suggestion.photo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={suggestion.photo}
                alt="The photo you dropped on the landing page"
                className="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {suggestion.source === "scan"
                  ? "Filled in from the photo you dropped"
                  : "Filled in from what you told us"}
              </p>
              <p className="muted mt-1 text-sm leading-relaxed">
                {suggestedSpeciesLabel && (
                  <>
                    Species: <span className="font-medium">{suggestedSpeciesLabel}</span>
                  </>
                )}
                {suggestion.breed && (
                  <>
                    {" · "}Breed: <span className="font-medium">{suggestion.breed}</span>
                  </>
                )}
                . {suggestion.source === "scan" ? "A guess from the photo" : "Your answer"} —
                change anything that&apos;s wrong.
              </p>
              <button
                type="button"
                onClick={clearPrefill}
                className="muted mt-2 inline-flex min-h-11 items-center text-xs underline underline-offset-4 hover:text-[var(--brand-text)]"
              >
                Clear this and start blank
              </button>
            </div>
          </div>

          {suggestion.photo && (
            /* The landing page promises the dropped photo isn't saved, and it
               isn't: this copy lives only in this browser tab. Saying so here
               stops the thumbnail from implying an upload that didn't happen. */
            <p className="muted mt-3 border-t border-brand-300/60 pt-2 text-xs leading-relaxed dark:border-brand-500/40">
              That photo is shown from this browser only — we never uploaded it.
              You can add a photo to their record once they&apos;re saved.
            </p>
          )}
        </div>
      )}

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
        {suggestion && (
          <p className="muted mt-1 text-xs">
            The only thing we still need — the rest is above, or can wait.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BreedInput key={breedKey} defaultSpecies={speciesDefault} defaultBreed={breedDefault} />

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
