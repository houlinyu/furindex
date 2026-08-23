"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SpeciesChoice from "@/components/SpeciesChoice";
import { saveFunnelIntent, type FunnelSpecies } from "@/lib/funnel-intent";

/**
 * The standalone cat-or-dog step: one tap, then straight on.
 *
 * The choice is recorded before we navigate, so it survives the sign-up round
 * trip and arrives at the pet form as a pre-fill.
 *
 * WHY IT NAVIGATES TO /pets/new AND NOT TO /login
 * Middleware already bounces a signed-out visitor to /login?next=/pets/new and
 * brings them back afterwards. Pointing at the destination rather than at the
 * gate means the signed-in case (a second pet) doesn't take a detour through a
 * login page it would only be redirected away from.
 */
export default function StartFunnel() {
  const router = useRouter();
  const [chosen, setChosen] = useState<FunnelSpecies | null>(null);

  function choose(species: FunnelSpecies) {
    saveFunnelIntent({ species, source: "choice" });
    setChosen(species);
    router.push("/pets/new");
  }

  return <SpeciesChoice onChoose={choose} busySpecies={chosen} />;
}
