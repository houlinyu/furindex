"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PetSex, PetSpecies } from "@/lib/types";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createPet(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");

  const { data, error } = await supabase
    .from("pets")
    .insert({
      owner_id: user.id,
      name,
      species: (str(formData, "species") ?? "dog") as PetSpecies,
      sex: (str(formData, "sex") ?? "unknown") as PetSex,
      breed: str(formData, "breed"),
      birth_date: str(formData, "birth_date"),
      microchip_id: str(formData, "microchip_id"),
      notes: str(formData, "notes"),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/pets");
  revalidatePath("/dashboard");
  redirect(`/pets/${data.id}`);
}

export async function deletePet(formData: FormData) {
  const id = str(formData, "pet_id");
  if (!id) throw new Error("Missing pet");

  const supabase = await createClient();
  // RLS restricts this to pets the caller owns; no extra ownership check needed.
  const { error } = await supabase.from("pets").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/pets");
  revalidatePath("/dashboard");
  redirect("/pets");
}

export async function addVaccination(formData: FormData) {
  const petId = str(formData, "pet_id");
  const name = str(formData, "name");
  const administeredOn = str(formData, "administered_on");
  if (!petId || !name || !administeredOn) throw new Error("Missing required fields");

  const supabase = await createClient();
  const { error } = await supabase.from("vaccinations").insert({
    pet_id: petId,
    name,
    administered_on: administeredOn,
    due_on: str(formData, "due_on"),
    vet_clinic: str(formData, "vet_clinic"),
    lot_number: str(formData, "lot_number"),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/pets/${petId}`);
  revalidatePath("/dashboard");
}

export async function addMedication(formData: FormData) {
  const petId = str(formData, "pet_id");
  const name = str(formData, "name");
  if (!petId || !name) throw new Error("Missing required fields");

  const supabase = await createClient();
  const { error } = await supabase.from("medications").insert({
    pet_id: petId,
    name,
    dosage: str(formData, "dosage"),
    frequency: str(formData, "frequency"),
    start_date: str(formData, "start_date") ?? new Date().toISOString().slice(0, 10),
    end_date: str(formData, "end_date"),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/pets/${petId}`);
}

export async function addWeight(formData: FormData) {
  const petId = str(formData, "pet_id");
  const raw = str(formData, "weight_kg");
  if (!petId || !raw) throw new Error("Missing required fields");

  const weight = Number(raw);
  if (!Number.isFinite(weight) || weight <= 0) throw new Error("Weight must be a positive number");

  const supabase = await createClient();
  // One reading per day: a correction overwrites rather than duplicating.
  const { error } = await supabase.from("weight_logs").upsert(
    {
      pet_id: petId,
      recorded_on: str(formData, "recorded_on") ?? new Date().toISOString().slice(0, 10),
      weight_kg: weight,
    },
    { onConflict: "pet_id,recorded_on" }
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/pets/${petId}`);
}

export async function addVetVisit(formData: FormData) {
  const petId = str(formData, "pet_id");
  if (!petId) throw new Error("Missing pet");

  const costRaw = str(formData, "cost");
  const supabase = await createClient();
  const { error } = await supabase.from("vet_visits").insert({
    pet_id: petId,
    visited_on: str(formData, "visited_on") ?? new Date().toISOString().slice(0, 10),
    clinic: str(formData, "clinic"),
    reason: str(formData, "reason"),
    diagnosis: str(formData, "diagnosis"),
    notes: str(formData, "notes"),
    cost_cents: costRaw ? Math.round(Number(costRaw) * 100) : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/pets/${petId}`);
}
