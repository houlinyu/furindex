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
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          {/* Home, per web convention — this used to point at /dashboard, which
              left signed-in users with no route back to the public pages. */}
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap font-semibold tracking-tight"
            aria-label="FurIndex home"
          >
            🐾 FurIndex
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
              Dashboard
            </Link>
            <Link href="/pets" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
              Pets
            </Link>
            <Link href="/community" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
              Community
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {email && <span className="muted hidden text-xs sm:inline">{email}</span>}
            <form action={signOut}>
              <button className="muted shrink-0 whitespace-nowrap text-xs underline underline-offset-4">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>

      {/* The public pages are otherwise unreachable from inside the app. */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-xs">
          <Link href="/" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
            Home
          </Link>
          <Link href="/science" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
            The science
          </Link>
          <Link href="/compare" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
            Compare
          </Link>
          <Link href="/partners" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
            Partners
          </Link>
          <span className="muted ml-auto">🐾 FurIndex · built at Sundai</span>
        </div>
      </footer>
    </div>
  );
}
