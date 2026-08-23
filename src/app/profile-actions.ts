"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  BLOCK_COUNT,
  PROFILE_BLOCKS,
  blockById,
  blockIndexById,
  checkOptionKeys,
  isTristate,
  questionsOf,
} from "@/lib/pet-profile";
import type { Pet, PetSex, PetSpecies, ProfileTristate } from "@/lib/types";

/**
 * Same contract as PetFormState / RecordFormState in @/app/actions: this
 * RETURNS errors and never throws. A thrown error becomes a full-page
 * "Application error", and in a seven-screen questionnaire that means the owner
 * loses the screen they were on and lands somewhere that looks broken. Three
 * separate crash bugs in this codebase were exactly this.
 *
 * (`redirect()` throws by design — that is Next's control flow, not an error,
 * and it is how every successful save here moves to the next block.)
 */
export type ProfileBlockState = { error?: string; ok?: boolean };

const SPECIES: readonly PetSpecies[] = [
  "dog", "cat", "bird", "rabbit", "reptile", "small_mammal", "other",
];
const SEXES: readonly PetSex[] = ["male", "female", "unknown"];

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * pet_profiles is created by a migration applied by hand, so a checkout can be
 * running against a database that hasn't got it yet. That is a deployment step
 * nobody has done, not something the owner did wrong, and Postgres's own
 * wording ("Could not find the table in the schema cache") reads like a bug.
 * 42P01 is "undefined table"; PGRST205 is PostgREST reporting the same thing.
 */
const MISSING_TABLE = "Answers can't be saved yet on this environment — the pet profile table hasn't been created.";
const isMissingTable = (code?: string) => ["42P01", "PGRST205"].includes(code ?? "");

/** Where a given intent should land. Kept in one place so Back and Skip agree. */
function destination(petId: string, index: number, intent: string): string {
  if (intent === "back") {
    return index === 0 ? `/pets/${petId}` : `/pets/${petId}/profile?block=${index - 1}`;
  }
  return index >= BLOCK_COUNT - 1
    ? `/pets/${petId}/profile?done=1`
    : `/pets/${petId}/profile?block=${index + 1}`;
}

/**
 * Save one block of the profile questionnaire.
 *
 * WHY ONE BLOCK AT A TIME rather than one submit at the end: this is seven
 * screens of optional questions, and the realistic session ends by closing the
 * tab somewhere in the middle. Saving per block means the most that can be lost
 * is the screen currently on the display. It is also what makes the thing
 * re-entrant — coming back is just opening it again.
 *
 * Every path through here ends in a redirect, including Back and Skip, so the
 * current block is written before navigating away. That is the whole reason
 * Back is a submit button and not a link: a link would silently drop whatever
 * had just been tapped.
 */
export async function saveProfileBlock(
  _prev: ProfileBlockState,
  formData: FormData
): Promise<ProfileBlockState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const petId = str(formData, "pet_id");
  if (!petId) return { error: "Missing pet." };

  const blockId = str(formData, "block") ?? "";
  const block = blockById(blockId);
  if (!block) return { error: "That question set doesn't exist." };
  const index = blockIndexById(blockId);

  const intent = str(formData, "intent") ?? "next";
  if (!["next", "back", "skip"].includes(intent)) return { error: "Unknown action." };

  const { multi, choice, hasBasics } = questionsOf(block);

  // Skip writes no answers at all — including not clearing answers already
  // stored for this block. "I don't want to answer this now" must never be a
  // way to delete something typed last week.
  const saveAnswers = intent !== "skip";

  if (hasBasics && saveAnswers) {
    const err = await saveBasics(supabase, formData, petId);
    if (err) return { error: err };
  }

  // ------------------------------------------------------ pet_profiles row --
  // Read first so completed_blocks accumulates rather than being overwritten by
  // whichever block was saved last.
  const { data: existing, error: readError } = await supabase
    .from("pet_profiles")
    .select("completed_blocks")
    .eq("pet_id", petId)
    .maybeSingle();
  if (readError) {
    return { error: isMissingTable(readError.code) ? MISSING_TABLE : readError.message };
  }

  const seen = new Set(existing?.completed_blocks ?? []);
  seen.add(block.id);

  const patch: Record<string, unknown> = {
    pet_id: petId,
    owner_id: user.id,
    // Ordered by the questionnaire, not by insertion, so the stored list reads
    // the same for everybody regardless of the order they answered in.
    completed_blocks: PROFILE_BLOCKS.map((b) => b.id).filter((id) => seen.has(id)),
  };

  if (saveAnswers) {
    for (const q of choice) {
      const raw = str(formData, q.column);
      // A single-choice question can be legitimately un-answered: everything
      // here is optional, and the "clear" control exists for exactly that.
      if (raw === null) {
        patch[q.column] = null;
        continue;
      }
      if (!isTristate(raw)) return { error: "That isn't one of the answers offered." };
      patch[q.column] = raw as ProfileTristate;
    }

    for (const q of multi) {
      // A gated follow-up that isn't showing posts nothing. Storing [] rather
      // than leaving the old list is deliberate: a stored condition list under
      // "no current conditions" is a contradiction, and it would quietly
      // corrupt any later count of who reports what.
      const gateOpen =
        !q.showWhen || patch[q.showWhen.column] === q.showWhen.equals;
      if (!gateOpen) {
        patch[q.column] = [];
        continue;
      }

      const posted = formData
        .getAll(q.column)
        .filter((v): v is string => typeof v === "string");
      const checked = checkOptionKeys(q.column, posted);
      if (!checked.ok) {
        // Reached only by a hand-edited POST, or by a stale tab after an option
        // key is renamed. Refusing beats saving a subset: a dropped answer
        // looks identical to a saved one.
        return { error: "Some of those answers weren't recognised, so nothing was saved." };
      }
      patch[q.column] = checked.keys;
    }
  }

  const { error } = await supabase
    .from("pet_profiles")
    .upsert(patch, { onConflict: "pet_id" });
  if (error) return { error: isMissingTable(error.code) ? MISSING_TABLE : error.message };

  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/profile`);
  redirect(destination(petId, index, intent));
}

/**
 * Block 1 writes to `pets`, not to pet_profiles — name, species, breed, sex and
 * birth date already live there and are read by the rest of the app. Copying
 * them into the profile table would create a second answer to "what is this
 * animal called" and no rule for which one wins.
 */
async function saveBasics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  petId: string
): Promise<string | null> {
  const name = str(formData, "name");
  // The only genuinely required value in the whole questionnaire, and only
  // because the pet already has one — this screen can correct it, not clear it.
  if (!name) return "Give your pet a name.";

  const birthDate = str(formData, "birth_date");
  const today = new Date().toISOString().slice(0, 10);
  if (birthDate && birthDate > today) return "Birth date can't be in the future.";

  const species = str(formData, "species");
  if (species && !(SPECIES as readonly string[]).includes(species)) {
    return "That isn't a species we know about.";
  }
  const sex = str(formData, "sex");
  if (sex && !(SEXES as readonly string[]).includes(sex)) {
    return "That isn't one of the options offered.";
  }

  const update: Partial<Pet> = {
    name,
    breed: str(formData, "breed"),
    birth_date: birthDate,
  };
  // Left out entirely when absent rather than written as null: species and sex
  // are NOT NULL with defaults, and a form that didn't render the control must
  // not blank what is already stored.
  if (species) update.species = species as PetSpecies;
  if (sex) update.sex = sex as PetSex;

  // RLS scopes this to pets the caller owns; no extra ownership check needed.
  const { error } = await supabase.from("pets").update(update).eq("id", petId);
  return error ? error.message : null;
}
