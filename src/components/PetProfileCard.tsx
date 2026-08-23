import Link from "next/link";
import { BLOCK_COUNT, profileHighlights, profileProgress } from "@/lib/pet-profile";
import { createClient } from "@/lib/supabase/server";
import type { PetProfile } from "@/lib/types";

/**
 * The profile questionnaire's entry point on the pet page.
 *
 * Async server component that fetches its own row, so wiring it in is a single
 * line and needs no change to the page's existing Promise.all — that block is
 * already thirteen queries deep and a fourteenth would be one more thing to get
 * wrong in a file nobody wants to touch.
 *
 * It shows what is answered, never what is absent, for the same reason
 * PetProgress does: a list of unanswered optional questions is a chore, and
 * this is somebody's animal, not a form to complete.
 */
export default async function PetProfileCard({
  petId,
  petName,
}: {
  petId: string;
  petName: string;
}) {
  const supabase = await createClient();
  // Errors are swallowed on purpose: if the migration hasn't been applied the
  // card still offers the questionnaire, and the quiz itself says what's up.
  const { data } = await supabase
    .from("pet_profiles")
    .select("*")
    .eq("pet_id", petId)
    .maybeSingle();

  const profile = (data as PetProfile | null) ?? null;
  const progress = profileProgress(profile);
  const highlights = profileHighlights(profile);
  // "started" means a block beyond Basics, which is filled in by creating the pet.
  const started = progress.started;

  return (
    <section className="card mb-8 p-5" aria-labelledby="pet-profile-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="pet-profile-heading" className="text-sm font-medium">
          About {petName}
        </h2>
        {started && (
          <p className="muted text-xs tabular-nums">
            {progress.done} of {BLOCK_COUNT}
          </p>
        )}
      </div>

      <p className="muted mt-2 text-sm leading-relaxed">
        {started
          ? "Temperament, routine, home and diet, in your own words. Change any of it whenever."
          : `A few optional questions about what ${petName} is like — personality, routine, food, home. Answer what you feel like; skip the rest.`}
      </p>

      {highlights.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {highlights.map((v, i) => (
            <li
              key={`${v}-${i}`}
              className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs"
            >
              {v}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/pets/${petId}/profile`}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          {!started
            ? "Answer a few questions"
            : progress.complete
              ? "Update the profile"
              : "Continue the profile"}
        </Link>
        {started && (
          <Link
            href={`/pets/${petId}/profile?done=1`}
            className="muted inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-[var(--brand-text)]"
          >
            See what&apos;s recorded
          </Link>
        )}
      </div>
    </section>
  );
}
