import Link from "next/link";

export default function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          🐾 Petfolio
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-sm">
          <Link href="/compare" className="muted hover:text-brand-600">
            Compare
          </Link>
          <Link href="/science" className="muted hover:text-brand-600">
            The science
          </Link>
          <Link href="/partners" className="muted hover:text-brand-600">
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
