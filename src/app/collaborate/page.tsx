import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { getUser } from "@/lib/supabase/server";
import PartnerInquiryForm from "@/components/PartnerInquiryForm";

export const metadata = {
  title: "Partner — FurIndex",
  description: "Integrate with an owner-permissioned, longitudinal pet health record.",
};

const TRACKS = [
  {
    icon: "⌚",
    title: "Wearables & sensors",
    lede: "Telemetry that lands beside clinical history, not in a separate app.",
    body: `Activity and sleep are near-universal on collars today; real vitals are
      rarer than the marketing suggests — resting heart rate is mostly inferred
      from motion, and true body temperature is essentially PetPace alone. Whatever
      you measure, our user-defined field layer stores arbitrary typed time series
      per animal, so a device partner writes into the same structure a vet report
      does.`,
    fit: `The recurring complaint in collar reviews is not the sensor — it is that
      the app shows today's number with no weekly trend, no history beyond 90 days,
      and no benchmark against similar animals. That layer is what we built, and
      building it is not what hardware teams are good at. FitBark's OAuth API is
      the one open door today; most others are closed, so realistic ingestion is
      often owner-initiated export rather than a vendor deal.`,
  },
  {
    icon: "🩺",
    title: "Veterinary clinics & practice software",
    lede: "Push the record instead of printing it.",
    body: `Today we read the owner's PDF. The better version is the clinic writing
      the record directly at discharge — no scanning, no transcription, no drift
      between what the vet recorded and what the owner ends up holding.`,
    fit: `For the clinic: fewer "can you resend my dog's vaccine history" calls,
      and owners who arrive with an accurate, complete history instead of a
      half-remembered one. For practice-management vendors: an owner-facing
      surface you don't have to build.`,
  },
  {
    icon: "🧬",
    title: "Diagnostics & genomics",
    lede: "Structured results, longitudinally, against a known animal.",
    body: `Panels, biopsies, sequencing. Results arrive as PDFs today and die there.
      Our field layer accepts arbitrary typed results, so a diagnostics partner's
      output becomes trackable over time rather than a one-off document — which
      is the precondition for anything personalised.`,
    fit: `See our note on where veterinary oncology is heading.`,
    href: "/writing/cancer-vaccine-for-one-dog",
    hrefLabel: "Read the piece →",
  },
  {
    icon: "🛡️",
    title: "Insurers & preventive care",
    lede: "Claims stall on missing history.",
    body: `An owner-held, timestamped record with document provenance shortens
      claims processing, and preventive-care programmes get a reminder channel
      owners actually open — because they opened it for their own reasons first.`,
    fit: `Owner-permissioned throughout. Data moves because the owner says so,
      and the grant is revocable.`,
  },
];

export default async function PartnersPage() {
  const user = await getUser();

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MarketingNav signedIn={!!user} />

      <main id="main">

      <section className="mx-auto max-w-5xl px-5 pb-12 pt-16">
        <p className="muted text-xs font-medium uppercase tracking-widest">Partner with us</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          We built the hard part: a structured, owner-confirmed health record for
          an animal.
        </h1>
        <p className="muted mt-5 max-w-2xl text-base leading-relaxed">
          It is longitudinal, it is owner-permissioned, and because the field layer
          is user-defined rather than fixed, it accepts data shapes we never
          anticipated — including yours. Most pet products generate data that has
          nowhere to live. This is the place it lives.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-6 md:grid-cols-2">
          {TRACKS.map((t) => (
            <div key={t.title} className="card flex flex-col p-6">
              <div className="text-2xl">{t.icon}</div>
              <p className="mt-3 font-medium">{t.title}</p>
              <p className="mt-1 text-sm font-medium text-[var(--brand-text)]">{t.lede}</p>
              <p className="muted mt-3 text-sm leading-relaxed">{t.body}</p>
              <p className="muted mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed">
                {t.fit}
              </p>
              {t.href && (
                <Link
                  href={t.href}
                  className="mt-3 inline-flex min-h-11 items-center text-xs font-medium text-[var(--brand-text)] hover:underline"
                >
                  {t.hrefLabel}
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-brand-50/30">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="text-xl font-semibold tracking-tight">
            The principle we won&apos;t trade away
          </h2>
          <p className="muted mt-3 text-sm leading-relaxed">
            Every record belongs to the owner and is private by default. Row-level
            security is enforced in the database, not in application code, so there
            is no code path that can forget the check — including ours. Any partner
            integration is an explicit, revocable grant by the owner. Never a
            default, never a side effect of signing up, and never bundled into a
            terms-of-service update.
          </p>
          <p className="muted mt-3 text-sm leading-relaxed">
            We think this is also the commercially correct position. The reason pet
            health data is fragmented is that every party wants to own it. An
            owner-held record is the only version everyone can agree to write into.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          What would you want to write into it?
        </h2>
        <div className="mt-8 text-left">
          <PartnerInquiryForm sourcePage="/collaborate" />
        </div>

      </section>
      </main>
    </div>
  );
}
