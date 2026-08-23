import Link from "next/link";

export default function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <Link href="/" className="shrink-0 whitespace-nowrap font-semibold tracking-tight">
          🐾 FurIndex
        </Link>
        <nav className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
          <Link href="/compare" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
            Compare
          </Link>
          <Link href="/science" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
            The science
          </Link>
          <Link href="/partners" className="muted inline-flex min-h-11 items-center hover:text-brand-600">
            Partners
          </Link>
          <Link
            href={signedIn ? "/dashboard" : "/login"}
            className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
