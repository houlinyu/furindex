"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Password auth, alongside magic links.
 *
 * The hosted Supabase mailer is capped at 2 emails/hour, which is fine for one
 * or two people and fatal in a live demo — the third person to try simply gets
 * nothing, with no error explaining why. Passwords have no such ceiling and no
 * spam-folder failure mode.
 */

type Result = { error: string } | never;

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  // Only same-origin relative paths — never bounce to a supplied host.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return { email, password, next: safeNext };
}

export async function signInWithPassword(formData: FormData): Promise<Result> {
  const { email, password, next } = readCredentials(formData);
  if (!email || !password) return { error: "Email and password are both required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately vague: distinguishing "no such account" from "wrong password"
    // turns the form into an account-enumeration oracle.
    return { error: "That email and password don't match an account." };
  }
  redirect(next);
}

export async function signUpWithPassword(formData: FormData): Promise<Result> {
  const { email, password, next } = readCredentials(formData);
  if (!email || !password) return { error: "Email and password are both required." };
  if (password.length < 8) return { error: "Use at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  // With email confirmation on, signUp returns a user but no session. Try an
  // immediate sign-in: if confirmation is required this fails and we say so,
  // rather than dumping the user on a page that looks signed-out for no reason.
  if (!data.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      return {
        error:
          "Account created. Check your email to confirm it, then sign in — confirmation is switched on for this project.",
      };
    }
  }
  redirect(next);
}
