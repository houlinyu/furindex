"use client";

import { useActionState, useEffect, useState } from "react";
import { logActivity } from "@/app/activity-actions";
import type { RecordFormState } from "@/app/actions";
import type { PetSpecies } from "@/lib/types";
import {
  ACTIVE_THRESHOLD_G,
  ACTIVITY_CITATION,
  ACTIVITY_NOT_A_SYMPTOM_NOTE,
  ACTIVITY_RUNGS,
  activitySourceCaveat,
  describeActiveThreshold,
  formatG,
  isActiveRung,
  type ActivityRung,
  type ActivityRungId,
} from "@/lib/activity";

/**
 * One tap logs today's activity.
 *
 * The whole design brief for this component is: as easy as an invented
 * "energy 1–5" slider, but every rung is a behaviour somebody actually measured
 * on a collar accelerometer, and the number stored is that behaviour's
 * published mean intensity in g. See src/lib/activity.ts for why that matters.
 *
 * Two things the UI is obliged to keep visible and never bury:
 *   1. The g anchors are DOG data — 22 dogs, 6 of them beagle puppies. On a cat
 *      or a rabbit the words still describe what the owner saw, but the numbers
 *      are borrowed. activitySourceCaveat() says so in the pet's own species.
 *   2. A low rung is not a symptom. Nothing here may hint that a quiet day
 *      means pain, illness or decline — see ACTIVITY_NOT_A_SYMPTOM_NOTE.
 *
 * Buttons rather than a slider or a select: a slider implies a continuum
 * between rungs that the underlying data doesn't have (0.02 → 0.59 g is not
 * linear in anything), and a select hides the descriptions that make the rungs
 * mean the same thing to two different owners.
 */
export default function ActivityLogger({
  petId,
  species,
  loggedToday,
}: {
  petId: string;
  species: PetSpecies;
  /** What's already stored for today, if anything. Null = nothing logged yet. */
  loggedToday: ActivityRung | null;
}) {
  const [state, formAction, pending] = useActionState<RecordFormState, FormData>(
    logActivity,
    {}
  );

  // Local echo of the tap so the selection moves immediately, before the server
  // action's revalidate has round-tripped and refreshed `loggedToday`.
  const [chosen, setChosen] = useState<ActivityRungId | null>(null);

  useEffect(() => {
    // Nothing was written, so the highlight would be a lie. Drop back to
    // whatever the server says is actually stored.
    if (state.error) setChosen(null);
  }, [state]);

  const selected = chosen ?? loggedToday?.id ?? null;
  const selectedRung = ACTIVITY_RUNGS.find((r) => r.id === selected) ?? null;

  function submit(formData: FormData) {
    const rung = formData.get("rung");
    if (typeof rung === "string") setChosen(rung as ActivityRungId);
    formAction(formData);
  }

  return (
    <form action={submit} className="card p-4">
      <input type="hidden" name="pet_id" value={petId} />

      <fieldset disabled={pending} className="min-w-0">
        <legend className="text-sm font-medium">How active were they today?</legend>

        <p className="muted mt-1 text-xs" aria-live="polite">
          {selectedRung ? (
            <>
              Logged for today: <span className="font-medium">{selectedRung.label}</span>{" "}
              ({formatG(selectedRung.vectorMagnitudeG)}). Tap another step to change it —
              one entry per day, so it replaces rather than adds.
            </>
          ) : (
            "Nothing logged for today yet. One tap does it."
          )}
        </p>

        <div className="mt-3 grid gap-2">
          {ACTIVITY_RUNGS.map((rung, i) => {
            const prev = ACTIVITY_RUNGS[i - 1];
            // The published cut point falls between two rungs, so the divider is
            // drawn from the data rather than hard-coded at a fixed index.
            const crossesThreshold = !!prev && !isActiveRung(prev) && isActiveRung(rung);
            const isSelected = selected === rung.id;

            return (
              <div key={rung.id} className="contents">
                {crossesThreshold && <ThresholdDivider />}

                <button
                  type="submit"
                  name="rung"
                  value={rung.id}
                  aria-describedby={`activity-desc-${rung.id}`}
                  className={[
                    // min-h-11 = 44px: the smallest target that is reliably
                    // tappable with a thumb, which is how this will be used.
                    "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left",
                    "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                    "disabled:opacity-60",
                    isSelected
                      // brand-500 at 10% reads correctly on both the light and the
                      // dark surface token; bg-brand-50 would vanish in dark mode.
                      ? "border-brand-500 bg-brand-500/10"
                      : "border-[var(--border)] hover:border-brand-500",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className={[
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs",
                      isSelected
                        ? "border-brand-500 text-brand-600 dark:text-brand-300"
                        : "border-[var(--border)] muted",
                    ].join(" ")}
                  >
                    {isSelected ? "✓" : rung.step}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {rung.label}
                      {isSelected && <span className="sr-only"> — logged for today</span>}
                    </span>
                    <span id={`activity-desc-${rung.id}`} className="muted block text-xs">
                      {rung.description}
                    </span>
                  </span>

                  <span className="muted shrink-0 text-right text-xs tabular-nums">
                    {/* Labelled as dog data at the point of use, not only in the
                        footnote — this is the number someone would otherwise
                        read as a measurement of their own animal. */}
                    <span className="block">{formatG(rung.vectorMagnitudeG)}</span>
                    <span className="block">±{rung.sdG} in dogs</span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {state.error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}

        {pending && (
          <p className="muted mt-3 text-xs" role="status">
            Saving…
          </p>
        )}
      </fieldset>

      <details className="mt-4 border-t border-[var(--border)] pt-3">
        <summary className="cursor-pointer text-xs font-medium">
          Where these numbers come from
        </summary>

        <div className="muted mt-2 space-y-2 text-xs leading-relaxed">
          <p>{activitySourceCaveat(species)}</p>
          <p>{describeActiveThreshold()}</p>
          <p>{ACTIVITY_NOT_A_SYMPTOM_NOTE}</p>
          <p>
            {ACTIVITY_CITATION.authors} ({ACTIVITY_CITATION.year}).{" "}
            {ACTIVITY_CITATION.journal} {ACTIVITY_CITATION.volume}:
            {ACTIVITY_CITATION.articleNumber}. doi:{ACTIVITY_CITATION.doi}
          </p>
        </div>
      </details>
    </form>
  );
}

/**
 * The published active/inactive boundary, drawn where it actually falls.
 *
 * It earns its place in the UI because it is the reason the ladder splits here
 * rather than somewhere we chose: everything below is "not active" and
 * everything above is "active" by the paper's cut point, not by our opinion of
 * what counts as exercise.
 */
function ThresholdDivider() {
  return (
    <div className="flex items-center gap-2 py-1" aria-hidden>
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="muted shrink-0 text-[11px]">
        active/inactive line · {ACTIVE_THRESHOLD_G} g in dogs
      </span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
