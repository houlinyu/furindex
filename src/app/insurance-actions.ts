"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ClaimStatus } from "@/lib/types";

export type InsuranceState = { error?: string };

function money(fd: FormData, key: string): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
function text(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v || null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function addPolicy(
  _prev: InsuranceState,
  formData: FormData
): Promise<InsuranceState> {
  const { supabase, user } = await requireUser();

  const petId = text(formData, "pet_id");
  const provider = text(formData, "provider");
  if (!petId) return { error: "Missing pet." };
  if (!provider) return { error: "Which insurer is this with?" };

  const start = text(formData, "start_date");
  const end = text(formData, "end_date");
  if (start && end && end < start) {
    return { error: "The policy end date can't be before the start date." };
  }

  const pctRaw = String(formData.get("reimbursement_pct") ?? "").trim();
  const pct = pctRaw ? Number(pctRaw) : null;
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
    return { error: "Reimbursement must be between 0 and 100%." };
  }

  const { error } = await supabase.from("insurance_policies").insert({
    pet_id: petId,
    owner_id: user.id,
    provider,
    policy_number: text(formData, "policy_number"),
    plan_name: text(formData, "plan_name"),
    start_date: start,
    end_date: end,
    monthly_premium_cents: money(formData, "monthly_premium"),
    deductible_cents: money(formData, "deductible"),
    reimbursement_pct: pct,
    annual_limit_cents: money(formData, "annual_limit"),
    contact_phone: text(formData, "contact_phone"),
  });
  if (error) return { error: error.message };

  revalidatePath(`/pets/${petId}`);
  return {};
}

export async function addClaim(
  _prev: InsuranceState,
  formData: FormData
): Promise<InsuranceState> {
  const { supabase, user } = await requireUser();

  const petId = text(formData, "pet_id");
  const policyId = text(formData, "policy_id");
  if (!petId || !policyId) return { error: "Choose a policy first." };

  // The policy must be one of theirs — RLS would catch a forged id on insert,
  // but a clear message beats a constraint error.
  const { data: policy } = await supabase
    .from("insurance_policies")
    .select("id")
    .eq("id", policyId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!policy) return { error: "That policy no longer exists." };

  const { error } = await supabase.from("insurance_claims").insert({
    policy_id: policyId,
    pet_id: petId,
    owner_id: user.id,
    claim_number: text(formData, "claim_number"),
    service_date: text(formData, "service_date") ?? new Date().toISOString().slice(0, 10),
    description: text(formData, "description"),
    amount_claimed_cents: money(formData, "amount_claimed"),
    amount_paid_cents: money(formData, "amount_paid"),
    status: (text(formData, "status") ?? "draft") as ClaimStatus,
    notes: text(formData, "notes"),
  });
  if (error) return { error: error.message };

  revalidatePath(`/pets/${petId}`);
  return {};
}

export async function deletePolicy(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get("policy_id") ?? "");
  const petId = String(formData.get("pet_id") ?? "");
  if (!id) return;
  await supabase.from("insurance_policies").delete().eq("id", id);
  if (petId) revalidatePath(`/pets/${petId}`);
}
