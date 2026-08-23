import Link from "next/link";
import { signOut } from "@/app/actions";

export default function AppShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email?: string | null;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <Link href="/dashboard" className="font-semibold tracking-tight">
            🐾 Petfolio
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="muted hover:text-brand-600">
              Dashboard
            </Link>
            <Link href="/pets" className="muted hover:text-brand-600">
              Pets
            </Link>
            <Link href="/community" className="muted hover:text-brand-600">
              Community
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {email && <span className="muted hidden text-xs sm:inline">{email}</span>}
            <form action={signOut}>
              <button className="muted text-xs underline underline-offset-4">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
