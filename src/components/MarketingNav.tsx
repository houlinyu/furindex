import Logo from "@/components/Logo";
import Link from "next/link";

export default function MarketingNav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap font-semibold tracking-tight"
        >
          <span className="inline-flex items-center gap-2">
            <Logo className="h-6 w-6 text-brand-600" title="FurIndex" />
            FurIndex
          </span>
        </Link>
        <nav className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
          <Link href="/identify" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Pet ID
          </Link>
          <Link href="/compare" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Why Us
          </Link>
          <Link href="/writing" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Fur Science
          </Link>
          <Link href="/collaborate" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Partner
          </Link>
          <Link href="/contact" className="muted inline-flex min-h-11 min-w-11 items-center justify-center hover:text-[var(--brand-text)]">
            Contact
          </Link>
          <Link
            href={signedIn ? "/dashboard" : "/login"}
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            {signedIn ? "Dashboard" : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
