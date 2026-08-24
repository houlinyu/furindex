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
        <p className="muted mb-6 text-base font-medium uppercase tracking-[0.2em]">
          The owner-held pet health record
        </p>
        <h1 className="mx-auto max-w-5xl text-5xl font-semibold leading-[1.03] tracking-tight sm:text-8xl">
          Your pet&apos;s whole life
          <br />
          <span className="text-[var(--brand-text)]">in health, held by you.</span>
        </h1>
        <p className="mx-auto mt-10 max-w-3xl text-2xl leading-relaxed sm:text-3xl sm:leading-relaxed">
          It starts with a photo of the vet paperwork, turned into a living record
          — vaccinations, medications, weight, reminders before anything lapses.
          It grows into the whole picture: shared with everyone who cares for
          them, read against your own animal&apos;s history, with wearables and
          your vet writing straight in. One record, private and yours, that
          follows your pet their entire life.
        </p>

        <p className="mx-auto mt-10 max-w-2xl text-xl leading-relaxed sm:text-2xl">
          They can&apos;t tell you when something feels off.
          <br className="hidden sm:block" /> Their record can — start it today.
        </p>
        <div className="mt-8">
          <Link
            href={user ? "/dashboard" : "/login?register=1"}
            className="inline-flex min-h-14 items-center rounded-2xl bg-brand-600 px-10 py-4 text-lg font-medium text-white hover:bg-brand-700"
          >
            {user ? "Open your dashboard" : "Create your free account"}
          </Link>
        </div>
        <p className="muted mt-5 text-base">
          Free · your records stay private by default
        </p>

        <Link
          href="/identify"
          className="group mx-auto mt-14 flex max-w-lg items-center gap-4 rounded-2xl border border-[var(--border)] bg-brand-50/40 p-5 text-left transition hover:border-brand-400 dark:bg-brand-500/10"
        >
          <span className="text-4xl" aria-hidden>
            📸
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-medium">
              First, the fun part — who&apos;s that?
            </span>
            <span className="muted block text-sm leading-relaxed">
              Upload a cute photo of your furry friend, get the breed and a fact
              you didn&apos;t know. Free, no sign-up, and the photo never leaves
              your device.
            </span>
          </span>
          <span
            className="text-2xl text-[var(--brand-text)] transition group-hover:translate-x-0.5"
            aria-hidden
          >
            →
          </span>
        </Link>
      </section>

      </main>

      {/* -------------------------------------------------------- footer ---- */}
      <footer className="mx-auto max-w-5xl px-5 py-12 text-center">
        <div className="muted flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
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
      </footer>
    </div>
  );
}
