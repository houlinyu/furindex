"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Finishes an auth email link and sends the visitor where they meant to go.
 *
 * Handles both link shapes without caring which arrived:
 *   - `?code=...`  (PKCE / magic link) — exchanged for a session here.
 *   - `#access_token=...&type=recovery` (implicit / password recovery) — the
 *     Supabase client establishes the session from the hash on its own; we read
 *     `type` off the hash to know it was a recovery.
 *
 * The routing is on INTENT: a recovery link means "I want to set a new
 * password", so it goes to /account?reset=1 and the password form, never
 * silently to the dashboard. That silent drop-through was the reported bug.
 */
export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const supabase = createClient();

      // The hash is the only place the recovery type and the implicit token
      // live. Read it before anything strips it.
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
      const isRecovery =
        hashParams.get("type") === "recovery" || params.get("type") === "recovery";

      const code = params.get("code");
      const nextRaw = params.get("next") ?? "";
      // Only same-origin relative paths — never bounce to a supplied host.
      const safeNext =
        nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : null;

      // PKCE / magic link: swap the code for a session.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error && !cancelled) {
          router.replace(`/login?error=${encodeURIComponent(error.message)}`);
          return;
        }
      } else {
        // Implicit flow (this is what recovery links use). @supabase/ssr's
        // browser client does NOT auto-establish a session from the hash — it is
        // built for PKCE — so the tokens are pulled out of the hash and set
        // explicitly. Without this the page hung on "Signing you in…" forever
        // and the reset silently failed, which is the bug being fixed.
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error && !cancelled) {
            router.replace(`/login?error=${encodeURIComponent(error.message)}`);
            return;
          }
          // Drop the tokens out of the address bar so they are not left in
          // history or copied into a shared link.
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        router.replace("/login?error=link_expired");
        return;
      }

      // Recovery always wins over `next`: the whole point of the link is to set
      // a password, and dropping someone straight into the app with a session
      // is what made the reset feel like it "didn't work".
      if (isRecovery) {
        setMessage("Taking you to set a new password…");
        router.replace("/account?reset=1");
        return;
      }

      router.replace(safeNext ?? "/dashboard");
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="muted text-sm" role="status">
        {message}
      </p>
    </main>
  );
}
