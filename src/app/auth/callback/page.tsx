import { Suspense } from "react";
import AuthCallback from "@/components/AuthCallback";

/**
 * Where every auth email link lands: magic sign-in AND password recovery.
 *
 * WHY THIS IS A CLIENT PAGE, NOT A SERVER ROUTE
 * The previous server route read `?code` and exchanged it. But Supabase's
 * recovery links come back on the IMPLICIT flow: the token arrives in the URL
 * HASH (`#access_token=...&type=recovery`), which a server never sees. So the
 * route found no code, bounced to /login?error=missing_code — and the browser
 * client, reading that same hash, quietly established a session anyway. The
 * result was the exact bug reported: click the reset email, land signed in on
 * the dashboard, never shown a password form.
 *
 * A client component can see the hash. It lets the Supabase client finish
 * processing whichever shape the link used, then routes on intent: a recovery
 * goes to the "choose a new password" screen; anything else goes on to the app.
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallback />
    </Suspense>
  );
}
