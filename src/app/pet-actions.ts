"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PET_PHOTO_BUCKET, signedPetPhotoUrl } from "@/lib/photos";
import type { PetSex, PetSpecies } from "@/lib/types";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * Same shape as the create form's state. Declared here rather than imported from
 * actions.ts so this file and that one can be edited independently.
 */
export type PetFormState = {
  error?: string;
  /** Echoed back so a validation error doesn't wipe what was typed. */
  values?: Record<string, string>;
};

const FORM_KEYS = [
  "name",
  "species",
  "sex",
  "breed",
  "birth_date",
  "microchip_id",
  "notes",
] as const;

/** Every page whose copy of a pet goes stale when that pet changes. */
function revalidatePet(petId: string) {
  revalidatePath(`/pets/${petId}`);
  revalidatePath(`/pets/${petId}/edit`);
  revalidatePath("/pets");
  revalidatePath("/dashboard");
}

/**
 * Returns errors rather than throwing. A thrown error here becomes a full-page
 * "Application error" and the user loses every correction they just typed —
 * which on an edit form means losing the record they were trying to fix.
 */
export async function updatePet(
  _prev: PetFormState,
  formData: FormData
): Promise<PetFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const keep = (): Record<string, string> =>
    Object.fromEntries(FORM_KEYS.map((k) => [k, String(formData.get(k) ?? "")]));

  const id = str(formData, "pet_id");
  if (!id) return { error: "Couldn't tell which pet this was. Reload and try again.", values: keep() };

  const name = str(formData, "name");
  if (!name) return { error: "Give your pet a name.", values: keep() };

  const birthDate = str(formData, "birth_date");
  const today = new Date().toISOString().slice(0, 10);
  if (birthDate && birthDate > today) {
    return { error: "Birth date can't be in the future.", values: keep() };
  }

  // RLS scopes the update to pets the caller owns; selecting the row back is how
  // we tell "saved" from "matched nothing", which otherwise both look like success.
  const { data: saved, error } = await supabase
    .from("pets")
    .update({
      name,
      species: (str(formData, "species") ?? "dog") as PetSpecies,
      sex: (str(formData, "sex") ?? "unknown") as PetSex,
      breed: str(formData, "breed"),
      birth_date: birthDate,
      microchip_id: str(formData, "microchip_id"),
      notes: str(formData, "notes"),
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message, values: keep() };
  if (!saved) return { error: "That pet no longer exists.", values: keep() };

  revalidatePet(id);
  redirect(`/pets/${id}`);
}

export type PhotoResult = { error?: string; photoUrl?: string };

/**
 * Point a pet at an already-uploaded object. Called by the browser uploader
 * after the file lands in storage; a returned error is the uploader's signal to
 * delete the object it just wrote, so this must never report a false success.
 */
export async function setPetPhoto(input: {
  petId: string;
  storagePath: string;
}): Promise<PhotoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired — sign in again." };

  // The storage policy already confines writes to <uid>/…, but a client could
  // still hand us a path it doesn't own. Check the prefix before storing it.
  if (!input.storagePath.startsWith(`${user.id}/`)) {
    return { error: "Invalid storage path." };
  }

  const { data: current, error: readErr } = await supabase
    .from("pets")
    .select("photo_url")
    .eq("id", input.petId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!current) return { error: "That pet no longer exists." };

  const { data: saved, error } = await supabase
    .from("pets")
    .update({ photo_url: input.storagePath })
    .eq("id", input.petId)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!saved) return { error: "That pet no longer exists." };

  // Only after the row points at the new object: deleting first would leave the
  // pet showing a broken photo if the update then failed.
  if (current.photo_url && current.photo_url !== input.storagePath) {
    await supabase.storage.from(PET_PHOTO_BUCKET).remove([current.photo_url]);
  }

  revalidatePet(input.petId);
  const photoUrl = await signedPetPhotoUrl(supabase, input.storagePath);
  return photoUrl ? { photoUrl } : {};
}

export async function removePetPhoto(petId: string): Promise<PhotoResult> {
  const supabase = await createClient();

  const { data: current, error: readErr } = await supabase
    .from("pets")
    .select("photo_url")
    .eq("id", petId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!current) return { error: "That pet no longer exists." };
  if (!current.photo_url) return {};

  const { data: saved, error } = await supabase
    .from("pets")
    .update({ photo_url: null })
    .eq("id", petId)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!saved) return { error: "That pet no longer exists." };

  await supabase.storage.from(PET_PHOTO_BUCKET).remove([current.photo_url]);

  revalidatePet(petId);
  return {};
}
