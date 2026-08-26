import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { getUser } from "@/lib/supabase/server";
import { StepUpload, StepRead, StepConfirm } from "@/components/HowIcons";

export const metadata = {
  title: "How it works — FurIndex",
  description:
    "Three steps, about thirty seconds: drop a vet report, it gets read, you confirm every line before anything is saved.",
};

export default async function HowItWorksPage() {
  const user = await getUser();
  const cta = user ? "/dashboard" : "/login?register=1";
  const ctaLabel = user ? "Open your dashboard" : "Create your account";

  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />
      <main id="main">
        <section className="mx-auto max-w-6xl px-6 pb-8 pt-20 text-center">
          <p className="muted mb-4 text-sm font-medium uppercase tracking-[0.2em]">
            How it works
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            A photo in. A real record out.
          </h1>
          <p className="muted mx-auto mt-6 max-w-2xl text-lg leading-relaxed">
            No forms to fill, no typing out your dog&apos;s vaccine history. Bring
            the paperwork you already have and confirm what gets kept.
          </p>
        </section>

      {/* ---------------------------------------------------------- how ---- */}
      <section id="how" className="border-y border-[var(--border)] bg-brand-50/30 dark:bg-brand-500/10">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps, about thirty seconds
          </h2>
          <ol className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              {
                n: "1",
                Icon: StepUpload,
                title: "Drop the report in",
                body: "A PDF from the clinic, or a photo of the printout taken on your phone. Both work.",
              },
              {
                n: "2",
                Icon: StepRead,
                title: "It gets read",
                body: "Vaccinations, medications, weight, diagnosis, next-due dates — pulled out as structured records.",
              },
              {
                n: "3",
                Icon: StepConfirm,
                title: "You confirm",
                body: "Every line is shown before anything is saved. Nothing lands on the record without your tick.",
              },
            ].map((s) => (
              <li key={s.n} className="card relative overflow-hidden p-6">
                {/* A large, softly-tinted step number set behind the content —
                    decorative, and the reason the card reads as one of a
                    numbered series at a glance. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-1 -top-3 select-none text-[5.5rem] font-bold leading-none tracking-tighter text-brand-100 dark:text-brand-500/15"
                >
                  {s.n}
                </span>
                <div className="relative">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-[var(--brand-text)] dark:bg-brand-500/15">
                    <s.Icon className="h-6 w-6" />
                  </span>
                  <p className="muted mt-4 text-xs font-medium uppercase tracking-wide">
                    Step {s.n}
                  </p>
                  <p className="mt-1 font-medium">{s.title}</p>
                  <p className="muted mt-2 text-sm leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="card mx-auto mt-10 max-w-2xl p-5 text-center">
            <p className="text-sm font-medium">You always have the last word</p>
            <p className="muted mt-2 text-sm leading-relaxed">
              Every line is yours to keep or drop before it reaches your pet&apos;s
              record. Other apps save whatever the model returned in one tap — we
              think a health record is worth the extra three seconds.
            </p>
          </div>
        </div>
      </section>

        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Try it with one report.
          </h2>
          <p className="muted mx-auto mt-4 max-w-xl text-base leading-relaxed">
            The reading happens in about thirty seconds, and nothing lands on the
            record without your tick.
          </p>
          <div className="mt-8">
            <Link
              href={cta}
              className="inline-flex min-h-12 items-center rounded-xl bg-brand-600 px-8 py-3.5 text-base font-medium text-white hover:bg-brand-700"
            >
              {ctaLabel}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
