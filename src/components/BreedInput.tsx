"use client";

import { useState } from "react";
import { breedsFor } from "@/lib/breeds";
import { SPECIES_LABEL } from "@/lib/format";

const field =
  "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 focus:border-brand-500";

/**
 * Species selector plus a breed field backed by a <datalist>: common breeds are
 * suggested, but anything can be typed. A <select> would make mixes, rare breeds
 * and "we don't know" second-class, which for a rescue animal is the common case.
 */
export default function BreedInput({
  defaultSpecies = "dog",
  defaultBreed = "",
}: {
  defaultSpecies?: string;
  defaultBreed?: string;
}) {
  const [species, setSpecies] = useState(defaultSpecies);
  const options = breedsFor(species);

  return (
    <>
      <div>
        <label htmlFor="species" className="mb-1 block text-sm font-medium">
          Species
        </label>
        <select
          id="species"
          name="species"
          value={species}
          onChange={(e) => setSpecies(e.target.value)}
          className={field}
        >
          {Object.entries(SPECIES_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="breed" className="mb-1 block text-sm font-medium">
          Breed
        </label>
        <input
          id="breed"
          name="breed"
          list="breed-options"
          maxLength={80}
          defaultValue={defaultBreed}
          autoComplete="off"
          placeholder={options.length ? `e.g. ${options[1] ?? options[0]}` : "Anything you like"}
          className={field}
        />
        <datalist id="breed-options">
          {options.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <p className="muted mt-1 text-xs">
          {options.length
            ? "Start typing for suggestions — or write anything, including a mix."
            : "Type whatever fits."}
        </p>
      </div>
    </>
  );
}
