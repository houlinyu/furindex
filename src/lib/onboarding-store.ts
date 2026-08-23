/**
 * Reading and writing `pet_onboarding`.
 *
 * Server-side only, but deliberately NOT a `"use server"` module: it exports
 * plain helpers that take a Supabase client, the same shape as
 * `signedPetPhotoUrl` in src/lib/photos.ts. A "use server" file may export only
 * async functions, and everything it exports becomes a callable endpoint — a
 * read helper has no business being either.
 *
 * THE MISSING-TABLE CASE IS NOT AN EDGE CASE HERE
 * The team shares one Supabase project and applies supabase/schema.sql by hand,
 * so there is always a window — hours, sometimes a day — where this branch's
 * code is deployed and its table is not. PostgREST answers that with PGRST205
 * ("could not find the table in the schema cache"), and an unhandled one would
 * take out the pet page for every user, which is precisely the class of outage
 * this codebase has already had twice. So a missing table degrades: reads
 * return "nothing recorded", writes return a sentence, and onboarding stays
 * walkable without persistence.
 */

import type { createClient } from "@/lib/supabase/server";
import {
  parseProgress,
  type OnboardingProgress,
  type OnboardingStepKey,
  type OnboardingStepStatus,
} from "@/lib/onboarding";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** PostgREST/Postgres codes for "that relation does not exist (yet)". */
const MISSING_TABLE = new Set(["PGRST205", "PGRST204", "42P01", "42703"]);

function isMissingTable(error: { code?: string | null } | null): boolean {
  return !!error?.code && MISSING_TABLE.has(error.code);
}

export type OnboardingRecord = {
  progress: OnboardingProgress;
  /** Where they were last seen. Analytics and resume tiebreak; never trusted. */
  lastStep: string | null;
  /**
   * False when the table has not been migrated into this database yet. The UI
   * uses it to say so out loud in dev rather than silently losing answers.
   */
  stored: boolean;
};

const EMPTY: OnboardingRecord = { progress: {}, lastStep: null, stored: true };

/**
 * Progress for one pet. Never throws: a pet with no row yet, a database with no
 * table yet and a genuine query error all come back as "nothing recorded",
 * because none of them is a reason to fail a page render.
 */
export async function loadOnboarding(
  supabase: Supabase,
  petId: string
): Promise<OnboardingRecord> {
  const { data, error } = await supabase
    .from("pet_onboarding")
    .select("steps, last_step")
    .eq("pet_id", petId)
    .maybeSingle();

  if (error) return { ...EMPTY, stored: !isMissingTable(error) };
  if (!data) return EMPTY;

  return {
    progress: parseProgress(data.steps),
    lastStep: typeof data.last_step === "string" ? data.last_step : null,
    stored: true,
  };
}

/**
 * Records one step as completed or skipped, leaving every other step alone.
 *
 * Read-modify-write rather than a jsonb `||` merge, because PostgREST cannot
 * express the merge and a stored function would be a second unmigrated object
 * to go wrong. The lost-update window is one owner clicking two buttons in two
 * tabs at the same instant; if concurrent writes ever become real — a content
 * block auto-saving while the nav submits — promote this to a
 * `set_onboarding_step(pet_id, step, status)` function that does
 * `steps = steps || jsonb_build_object($2, $3)` in one statement.
 */
export async function saveStepStatus(
  supabase: Supabase,
  args: {
    petId: string;
    ownerId: string;
    step: OnboardingStepKey;
    status: OnboardingStepStatus;
  }
): Promise<{ error?: string }> {
  const current = await loadOnboarding(supabase, args.petId);
  if (!current.stored) {
    return {
      error:
        "Onboarding progress isn't set up in this database yet — run supabase/schema.sql.",
    };
  }

  const steps: Record<string, string> = { ...current.progress, [args.step]: args.status };

  const { error } = await supabase.from("pet_onboarding").upsert(
    {
      pet_id: args.petId,
      owner_id: args.ownerId,
      steps,
      last_step: args.step,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "pet_id" }
  );

  if (error) {
    if (isMissingTable(error)) {
      return {
        error:
          "Onboarding progress isn't set up in this database yet — run supabase/schema.sql.",
      };
    }
    return { error: error.message };
  }
  return {};
}
