import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import FeatureShowcase from "@/components/FeatureShowcase";
import { getUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Roadmap — FurIndex",
  description:
    "How FurIndex works today, and where it's going — every block tagged honestly: live now, building, or next up.",
};

export default async function RoadmapPage() {
  const user = await getUser();
  const cta = user ? "/dashboard" : "/login";
  const ctaLabel = user ? "Open your dashboard" : "Start free";

  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />
      <main id="main">
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center">
          <p className="muted mb-4 text-sm font-medium uppercase tracking-[0.2em]">
            How it works · where it&apos;s going
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
            Built in the open, one honest block at a time.
          </h1>
          <p className="muted mx-auto mt-6 max-w-2xl text-lg leading-relaxed">
            The record works today. The rest is on its way — and every part of it
            says exactly where it stands, nothing dressed up as done before it is.
          </p>
        </section>

      {/* ---------------------------------------------------------- how ---- */}
      <section id="how" className="border-y border-[var(--border)] bg-brand-50/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps, about thirty seconds
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                n: "1",
                icon: "📄",
                title: "Drop the report in",
                body: "A PDF from the clinic, or a photo of the printout taken on your phone. Both work.",
              },
              {
                n: "2",
                icon: "🔎",
                title: "It gets read",
                body: "Vaccinations, medications, weight, diagnosis, next-due dates — pulled out as structured records.",
              },
              {
                n: "3",
                icon: "✅",
                title: "You confirm",
                body: "Every line is shown before anything is saved. Nothing lands on the record without your tick.",
              },
            ].map((s) => (
              <li key={s.n} className="card p-6">
                <div className="text-3xl">{s.icon}</div>
                <p className="muted mt-3 text-xs font-medium uppercase tracking-wide">
                  Step {s.n}
                </p>
                <p className="mt-1 font-medium">{s.title}</p>
                <p className="muted mt-2 text-sm leading-relaxed">{s.body}</p>
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

        <FeatureShowcase />

        <section className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Start with what&apos;s live.
          </h2>
          <p className="muted mx-auto mt-4 max-w-xl text-base leading-relaxed">
            The paperwork-to-record part is here now. Bring one vet report and see
            it fill in — the rest arrives around it.
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
