import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

/** Supabase client for Client Components. Anon key only — RLS does the guarding. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
