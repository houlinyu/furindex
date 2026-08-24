import Logo from "@/components/Logo";
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
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          {/* Home, per web convention — this used to point at /dashboard, which
              left signed-in users with no route back to the public pages. */}
          <Link
            href="/"
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-lg font-semibold tracking-tight"
            aria-label="FurIndex home"
          >
            <span className="inline-flex items-center gap-2">
              <Logo className="h-8 w-8 text-brand-600" title="FurIndex" />
              FurIndex
            </span>
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
              Dashboard
            </Link>
            <Link href="/pets" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
              Pets
            </Link>
            <Link href="/community" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
              Community
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {email && (
              <Link
                href="/account"
                className="muted hidden min-h-11 items-center text-xs underline underline-offset-4 hover:text-[var(--brand-text)] sm:inline-flex"
              >
                {email}
              </Link>
            )}
            <form action={signOut}>
              <button className="muted inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-xs underline underline-offset-4">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {children}
      </main>

      {/* The public pages are otherwise unreachable from inside the app. */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-4 text-xs">
          <Link href="/" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Home
          </Link>
          <Link href="/writing" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Fur Science
          </Link>
          <Link href="/compare" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Why Us
          </Link>
          <Link href="/collaborate" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Partner
          </Link>
          <span className="muted ml-auto">FurIndex — a Sundai project</span>
        </div>
      </footer>
    </div>
  );
}
