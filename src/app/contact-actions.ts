"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyOwner } from "@/lib/notify-owner";

export type ContactState = { error?: string; ok?: boolean };

/**
 * The open contact box. No auth, no fixed shape — an email to reply to and
 * whatever the person wants to say. Same privacy posture as the partner form:
 * anyone may write, only the owner may read (RLS on contact_messages).
 */
export async function submitContact(
  _prev: ContactState,
  formData: FormData
): Promise<ContactState> {
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const sourcePage = String(formData.get("source_page") ?? "").trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That email address doesn't look right." };
  }
  if (email.length > 254) return { error: "That email address is too long." };
  if (!message) return { error: "Add a message — a sentence or two is plenty." };
  if (message.length > 4000) return { error: "Please keep it under 4000 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("contact_messages").insert({
    email,
    message,
    source_page: sourcePage,
    submitter: user?.id ?? null,
  });

  if (error) {
    console.error("contact insert failed", error);
    return { error: "Something went wrong sending that. Try again in a moment." };
  }

  await notifyOwner(`FurIndex contact from ${email}`, email, message);
  return { ok: true };
}
