"use client";

import { useEffect, useState } from "react";
import NewPetForm, { type PetPrefill } from "@/components/NewPetForm";
import { clearFunnelIntent, readFunnelIntent } from "@/lib/funnel-intent";

/**
 * Reads what the funnel carried across the sign-up boundary and hands it to the
 * form as a suggestion.
 *
 * WHY THE READ IS IN AN EFFECT
 * sessionStorage does not exist during the server render. Reading it while
 * rendering would make the server HTML and the first client HTML disagree,
 * which React resolves by throwing away the tree — so instead the first paint
 * is the ordinary blank form, and the pre-filled version is keyed in a moment
 * later. The remount is what lets the uncontrolled fields pick up new defaults.
 *
 * Nothing here trusts the stored value: readFunnelIntent re-validates the whole
 * shape and returns null on anything unexpected, and the server re-checks
 * everything it inserts regardless.
 */
export default function NewPetPrefill() {
  const [prefill, setPrefill] = useState<PetPrefill | null>(null);

  useEffect(() => {
    const intent = readFunnelIntent();
    if (!intent) return;
    setPrefill({
      species: intent.species,
      breed: intent.breed,
      photo: intent.photo,
      source: intent.source,
    });
  }, []);

  return (
    <NewPetForm
      key={prefill ? "prefilled" : "plain"}
      prefill={prefill}
      onClearPrefill={clearFunnelIntent}
      onPrefillConsumed={clearFunnelIntent}
    />
  );
}
