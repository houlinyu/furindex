"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SPECIES_LABEL } from "@/lib/format";
import { readFunnelIntent, type FunnelIntent } from "@/lib/funnel-intent";

/**
 * "You already told us this" — shown on the empty dashboard when the funnel
 * carried something in.
 *
 * A visitor who answered cat-or-dog and then signed up can land here rather
 * than on the pet form (a magic-link sign-in, or the generic CTA in the header).
 * Without this, the dashboard silently forgets the answer they just gave and
 * the funnel looks like it dropped them. Renders nothing when there is nothing
 * to resume, which is the ordinary case.
 */
export default function FunnelResume() {
  const [intent, setIntent] = useState<FunnelIntent | null>(null);

  // Same reason as NewPetPrefill: sessionStorage is not readable during the
  // server render, so this can only run after mount.
  useEffect(() => setIntent(readFunnelIntent()), []);

  if (!intent) return null;
  const species = (SPECIES_LABEL[intent.species] ?? intent.species).toLowerCase();

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-brand-300 bg-brand-50/50 p-4 dark:border-brand-500/50 dark:bg-brand-500/10">
      {intent.photo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={intent.photo}
          alt="The photo you dropped on the landing page"
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      )}
      <p className="min-w-0 flex-1 basis-56 text-sm leading-relaxed">
        You told us you have a {species}
        {intent.breed ? ` — maybe a ${intent.breed}` : ""}. That&apos;s already in
        the form, waiting for a name.
      </p>
      <Link
        href="/pets/new"
        className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
      >
        Carry on
      </Link>
    </div>
  );
}
