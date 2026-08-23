"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PetSpecies } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Joining is explicit. Until this runs, the owner is invisible to everyone. */
export async function joinCommunity(formData: FormData) {
  const { supabase, user } = await requireUser();

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName.length < 2) throw new Error("Pick a display name of at least 2 characters");

  const { error } = await supabase.from("community_profiles").upsert({
    id: user.id,
    display_name: displayName,
    bio: String(formData.get("bio") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    avatar_emoji: String(formData.get("avatar_emoji") ?? "🐾").slice(0, 8) || "🐾",
    is_public: true,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/community");
}

/** Leaving hides the profile, its pets and its posts from everyone else at once,
 *  because every community read policy keys off is_public. Nothing is deleted. */
export async function leaveCommunity() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("community_profiles")
    .update({ is_public: false })
    .eq("id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/community");
}

export async function createPost(formData: FormData) {
  const { supabase, user } = await requireUser();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("Say something first");
  if (body.length > 1000) throw new Error("Keep it under 1000 characters");

  const communityPetId = String(formData.get("community_pet_id") ?? "") || null;

  const { error } = await supabase.from("community_posts").insert({
    author_id: user.id,
    body,
    community_pet_id: communityPetId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/community");
}

export async function deletePost(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("post_id") ?? "");
  if (!id) return;
  // RLS restricts deletes to your own posts.
  await supabase.from("community_posts").delete().eq("id", id);
  revalidatePath("/community");
}

export async function toggleReaction(postId: string, emoji: string) {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("post_reactions")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("post_reactions")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .eq("emoji", emoji);
  } else {
    await supabase
      .from("post_reactions")
      .insert({ post_id: postId, user_id: user.id, emoji });
  }
  revalidatePath("/community");
}

/**
 * Publishes a pet to the community. This COPIES the sociable fields into
 * community_pets — it does not expose the health record. source_pet_id is kept
 * only so the UI can tell which pets are already published.
 */
export async function publishPet(formData: FormData) {
  const { supabase, user } = await requireUser();

  const sourcePetId = String(formData.get("source_pet_id") ?? "") || null;
  let name = String(formData.get("name") ?? "").trim();
  let species = String(formData.get("species") ?? "other") as PetSpecies;
  let breed = String(formData.get("breed") ?? "").trim() || null;

  if (sourcePetId) {
    // Re-read from the owner's own record rather than trusting posted values.
    const { data: pet } = await supabase
      .from("pets")
      .select("name, species, breed")
      .eq("id", sourcePetId)
      .maybeSingle();
    if (!pet) throw new Error("Pet not found");
    name = pet.name;
    species = pet.species as PetSpecies;
    breed = pet.breed;
  }
  if (!name) throw new Error("A name is required");

  const { error } = await supabase.from("community_pets").insert({
    owner_id: user.id,
    source_pet_id: sourcePetId,
    name,
    species,
    breed,
    bio: String(formData.get("bio") ?? "").trim() || null,
    avatar_emoji: String(formData.get("avatar_emoji") ?? "🐾").slice(0, 8) || "🐾",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/community");
}

export async function unpublishPet(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("community_pet_id") ?? "");
  if (!id) return;
  await supabase.from("community_pets").delete().eq("id", id);
  revalidatePath("/community");
}
