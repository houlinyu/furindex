"use client";

import { FUNNEL_SPECIES, type FunnelSpecies } from "@/lib/funnel-intent";

const COPY: Record<FunnelSpecies, { emoji: string; label: string }> = {
  dog: { emoji: "🐕", label: "A dog" },
  cat: { emoji: "🐈", label: "A cat" },
};

/**
 * The cat-or-dog step, on its own.
 *
 * WHY IT EXISTS SEPARATELY FROM THE SCANNER
 * Three different people need this exact question answered and only one of them
 * has a photo in hand: the visitor on a laptop with the pictures on their phone,
 * the visitor whose scan came back unsure, and every visitor at all when
 * scanning is switched off (which is the case on this deployment). Making it a
 * component rather than a branch inside the widget means all three get the same
 * two buttons, and neither path is a degraded version of the other.
 *
 * Two choices only, deliberately. The record supports rabbits and reptiles and
 * the pet form still offers them — but the funnel's job is to get one decision
 * made in one tap, and a seven-item list is a menu, not a decision.
 */
export default function SpeciesChoice({
  onChoose,
  busySpecies = null,
  size = "lg",
}: {
  onChoose: (species: FunnelSpecies) => void;
  /** Renders one button as working — for choices that navigate. */
  busySpecies?: FunnelSpecies | null;
  size?: "lg" | "sm";
}) {
  const large = size === "lg";

  return (
    <div className="flex gap-3">
      {FUNNEL_SPECIES.map((species) => {
        const { emoji, label } = COPY[species];
        const busy = busySpecies === species;
        return (
          <button
            key={species}
            type="button"
            onClick={() => onChoose(species)}
            disabled={busySpecies !== null}
            className={`inline-flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] font-medium transition hover:border-brand-500 hover:bg-brand-50/50 hover:text-[var(--brand-text)] dark:hover:bg-brand-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-60 ${
              large ? "min-h-28 px-4 py-5 text-base" : "min-h-11 flex-row px-4 py-2 text-sm"
            }`}
          >
            <span aria-hidden className={large ? "text-4xl" : "text-lg"}>
              {emoji}
            </span>
            {busy ? "Just a second…" : label}
          </button>
        );
      })}
    </div>
  );
}
