import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import SetPasswordForm from "@/components/SetPasswordForm";
import { getUser } from "@/lib/supabase/server";

export const metadata = { title: "Your account — FurIndex" };

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/account");

  return (
    <AppShell email={user.email}>
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
      <p className="muted mb-6 mt-1 text-sm">Signed in as {user.email}.</p>
      <SetPasswordForm />
    </AppShell>
  );
}
