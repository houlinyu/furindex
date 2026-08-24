"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyOwner } from "@/lib/notify-owner";

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

  // Just email and a message now — the old name / organisation / category
  // fields were friction on a form whose whole job is to start a conversation.
  const email = get("email");
  const message = get("message");

  // Deliberately loose: the only real test of an address is sending to it, and
  // over-strict regexes reject valid addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That email address doesn't look right." };
  }
  if (email.length > 254) return { error: "That email address is too long." };
  if (!message.trim()) return { error: "Add a short message — a sentence or two is plenty." };
  if (message.length > 4000) return { error: "Please keep it under 4000 characters." };

  // name is NOT NULL on the table; the form no longer asks for it, so a stable
  // placeholder keeps the insert valid without inventing a person's name.
  const supabase = await createClient();
  const { error } = await supabase.from("partner_inquiries").insert({
    name: "(not given)",
    email,
    organisation: null,
    category: "other",
    message,
    source_page: get("source_page") || null,
  });

  if (error) {
    // Never surface a raw Postgres message on a public form.
    console.error("partner inquiry insert failed", error);
    return { error: "Something went wrong sending that. Try again in a moment." };
  }

  await notifyOwner(`FurIndex partner enquiry from ${email}`, email, message);
  return { ok: true };
}
