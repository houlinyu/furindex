"use server";

import { createClient } from "@/lib/supabase/server";

export type InquiryState = { error?: string; ok?: boolean };

const CATEGORIES = ["wearables", "clinic", "diagnostics", "insurance", "other"] as const;

/**
 * Public contact form. No auth required — that is the point — so validate
 * strictly here, and note that the table has an INSERT policy and deliberately
 * no SELECT policy: submissions can be written by anyone and read by no one
 * through the API.
 */
export async function submitInquiry(
  _prev: InquiryState,
  formData: FormData
): Promise<InquiryState> {
  const get = (k: string) => String(formData.get(k) ?? "").trim();

  const name = get("name");
  const email = get("email");
  const message = get("message");
  const organisation = get("organisation");
  const rawCategory = get("category");

  if (!name) return { error: "Please add your name." };
  if (name.length > 120) return { error: "That name is too long." };
  // Deliberately loose: the only real test of an address is sending to it, and
  // over-strict regexes reject valid addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That email address doesn't look right." };
  }
  if (email.length > 254) return { error: "That email address is too long." };
  if (message.length < 10) return { error: "Tell us a little more — at least a sentence." };
  if (message.length > 4000) return { error: "Please keep it under 4000 characters." };
  if (organisation.length > 160) return { error: "That organisation name is too long." };

  const category = (CATEGORIES as readonly string[]).includes(rawCategory)
    ? rawCategory
    : "other";

  const supabase = await createClient();
  const { error } = await supabase.from("partner_inquiries").insert({
    name,
    email,
    organisation: organisation || null,
    category,
    message,
    source_page: get("source_page") || null,
  });

  if (error) {
    // Never surface a raw Postgres message on a public form.
    console.error("partner inquiry insert failed", error);
    return { error: "Something went wrong sending that. Try again in a moment." };
  }
  return { ok: true };
}
