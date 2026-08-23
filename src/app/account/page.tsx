import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import SetPasswordForm from "@/components/SetPasswordForm";
import { getUser } from "@/lib/supabase/server";

export const metadata = { title: "Your account — FurIndex" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login?next=/account");

  // Set by the reset email's link. Arriving here already signed in is correct
  // and not a bug — the link IS the proof of address ownership — but landing on
  // a generic account page after clicking "reset my password" reads as though
  // the reset silently failed, so say what happened.
  const { reset } = await searchParams;
  const fromReset = reset === "1";

  return (
    <AppShell email={user.email}>
      <h1 className="text-2xl font-semibold tracking-tight">
        {fromReset ? "Choose a new password" : "Your account"}
      </h1>
      <p className="muted mb-6 mt-1 text-sm">
        {fromReset
          ? `That link signed you in as ${user.email}. Pick a new password below and it takes effect straight away.`
          : `Signed in as ${user.email}.`}
      </p>
      <SetPasswordForm fromReset={fromReset} />
    </AppShell>
  );
}
