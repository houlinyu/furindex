import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import MarketingNav from "@/components/MarketingNav";
import Logo from "@/components/Logo";
import {
  SUNDAI_PROJECT_URL,
  GITHUB_REPO_URL,
  REPO_IS_PUBLIC,
  isPlaceholder,
} from "@/lib/links";

export default async function LandingPage() {
  const user = await getUser();

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MarketingNav signedIn={!!user} />

      <main id="main">

      {/* --------------------------------------------------------- hero ---- */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-20 text-center sm:pt-28">
        {/* The mark, large, crowning the page — the one place it is the hero
            rather than a wayfinding label in the corner. */}
        <Logo
          className="mx-auto mb-8 h-28 w-28 text-brand-600 sm:h-36 sm:w-36"
          title="FurIndex"
        />
        <p className="muted mb-6 text-sm font-medium uppercase tracking-[0.2em]">
          The owner-held pet health record
        </p>
        <h1 className="mx-auto max-w-5xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          Your pet&apos;s whole health story,
          <br />
          <span className="text-[var(--brand-text)]">in one place you control.</span>
        </h1>
        <p className="muted mx-auto mt-8 max-w-3xl text-xl leading-relaxed sm:text-2xl sm:leading-relaxed">
          Snap the vet paperwork. We turn it into a living record — reminders,
          trends, the whole history a vet can read. Owner-held, private, never
          sold.
        </p>
        <p className="muted mt-5 text-sm">
          Your records stay private by default
        </p>

        <Link
          href="/identify"
          className="group mx-auto mt-12 flex max-w-md items-center gap-4 rounded-2xl border border-[var(--border)] bg-brand-50/40 p-4 text-left transition hover:border-brand-400 dark:bg-brand-500/10"
        >
          <span className="text-3xl" aria-hidden>
            📸
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              First, the fun part — who&apos;s that?
            </span>
            <span className="muted block text-xs leading-relaxed">
              Drop a photo, get the breed and a fact you didn&apos;t know. Free,
              no sign-up, and the photo never leaves your device.
            </span>
          </span>
          <span
            className="text-[var(--brand-text)] transition group-hover:translate-x-0.5"
            aria-hidden
          >
            →
          </span>
        </Link>
      </section>

      </main>

      {/* -------------------------------------------------------- footer ---- */}
      <footer className="mx-auto max-w-5xl px-5 py-12 text-center">
        <div className="muted flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
          <span>FurIndex</span>
          <span aria-hidden>·</span>
          {/* Until the project is registered, render plain text — a live link to
              a REPLACE_ME URL is worse than no link. */}
          {isPlaceholder(SUNDAI_PROJECT_URL) ? (
            <span>A Sundai project</span>
          ) : (
            <a
              href={SUNDAI_PROJECT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-[var(--brand-text)]"
            >
              A Sundai project
            </a>
          )}
          {REPO_IS_PUBLIC && (
            <>
              <span aria-hidden>·</span>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-[var(--brand-text)]"
              >
                Source
              </a>
            </>
          )}
        </div>
        <p className="muted mt-3 text-xs">
          Animal records are not PHI, and we still treat them like they matter.
        </p>
      </footer>
    </div>
  );
}
