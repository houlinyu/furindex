import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import MarketingNav from "@/components/MarketingNav";

export default async function LandingPage() {
  const user = await getUser();
  const cta = user ? "/dashboard" : "/login";
  const ctaLabel = user ? "Open your dashboard" : "Start free";

  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />

      {/* --------------------------------------------------------- hero ---- */}
      <section className="mx-auto max-w-5xl px-5 pb-16 pt-20 text-center">
        <p className="muted mb-4 text-xs font-medium uppercase tracking-widest">
          Built at Sundai
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Your pet&apos;s health record,
          <br />
          <span className="text-brand-600">from a photo of the paperwork.</span>
        </h1>
        <p className="muted mx-auto mt-5 max-w-xl text-base leading-relaxed">
          Vet visits generate paper. Petfolio reads it — the vaccinations, the
          dosages, the weight, the next-due dates — and turns it into a record
          that reminds you before things lapse.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={cta}
            className="rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
          >
            {ctaLabel}
          </Link>
          <a
            href="#how"
            className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium hover:border-brand-500 hover:text-brand-600"
          >
            See how it works
          </a>
        </div>
        <p className="muted mt-4 text-xs">
          No card required · Your records stay private by default
        </p>
      </section>

      {/* ---------------------------------------------------------- how ---- */}
      <section id="how" className="border-y border-[var(--border)] bg-brand-50/30">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
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

          <div className="card mx-auto mt-10 max-w-2xl p-5">
            <p className="text-sm font-medium">Why the confirmation step is not optional</p>
            <p className="muted mt-2 text-sm leading-relaxed">
              A model that misreads &ldquo;0.5 mg&rdquo; as &ldquo;5 mg&rdquo; must never write that
              to a medication record unseen. Extraction proposes; the owner decides.
              Low-confidence reads arrive with nothing pre-ticked.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ features ---- */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            {
              icon: "🔔",
              title: "Reminders that actually fire",
              body: "Due and overdue vaccinations surface on the dashboard, colour-coded by urgency. The thing you forget is the thing this is for.",
            },
            {
              icon: "📈",
              title: "Weight, tracked over time",
              body: "Every reading plots on a trend line. Gradual loss in an older cat is the kind of thing a chart catches and memory doesn't.",
            },
            {
              icon: "🧩",
              title: "Fields you define, not fields we picked",
              body: "Accept a measurement from a report — blood glucose, body condition score, dental grade — and it becomes a field you track from then on. The next report lines up with it automatically.",
            },
            {
              icon: "👋",
              title: "A community, opt-in only",
              body: "Meet other owners and their animals. Joining is a deliberate action, and it shares no health data — only what you choose to post.",
            },
          ].map((f) => (
            <div key={f.title} className="card p-6">
              <div className="text-2xl">{f.icon}</div>
              <p className="mt-3 font-medium">{f.title}</p>
              <p className="muted mt-2 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ partners ---- */}
      <section id="partners" className="border-y border-[var(--border)]">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <p className="muted text-xs font-medium uppercase tracking-widest">
            Partnerships
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold leading-snug tracking-tight">
            We built the hard part: a structured, owner-confirmed health record
            for an animal.
          </h2>
          <p className="muted mt-4 max-w-2xl text-sm leading-relaxed">
            That record is the missing substrate for a lot of pet products. It is
            longitudinal, it is owner-permissioned, and because the field layer is
            user-defined, it accepts data shapes we never anticipated — including
            yours.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="card p-6">
              <div className="text-2xl">⌚</div>
              <p className="mt-3 font-medium">Wearables &amp; sensors</p>
              <p className="muted mt-2 text-sm leading-relaxed">
                Activity, resting heart rate, sleep, temperature. Our user-defined
                field layer already stores arbitrary typed time series per animal —
                a device partner writes into the same structure a vet report does,
                so telemetry sits beside clinical history instead of in a separate app.
              </p>
              <p className="muted mt-3 text-xs">
                Natural fit for makers already shipping human wearables: the sensing
                stack transfers, the health-record layer is what&apos;s missing.
              </p>
            </div>

            <div className="card p-6">
              <div className="text-2xl">🩺</div>
              <p className="mt-3 font-medium">Veterinary clinics</p>
              <p className="muted mt-2 text-sm leading-relaxed">
                Today we read your PDF. The better version is the clinic pushing the
                record directly — no scanning, no transcription, no drift between
                what the vet recorded and what the owner has.
              </p>
              <p className="muted mt-3 text-xs">
                For the clinic: fewer &ldquo;can you resend my dog&apos;s vaccine history&rdquo;
                calls, and an owner who arrives with an accurate history.
              </p>
            </div>

            <div className="card p-6">
              <div className="text-2xl">🛡️</div>
              <p className="mt-3 font-medium">Insurers &amp; preventive care</p>
              <p className="muted mt-2 text-sm leading-relaxed">
                Claims stall on missing history. An owner-held, timestamped record
                with document provenance shortens that — and preventive-care
                programmes get a reminder channel that owners already open.
              </p>
              <p className="muted mt-3 text-xs">
                Owner-permissioned throughout. Data moves because the owner says so.
              </p>
            </div>
          </div>

          <div className="card mt-8 p-6">
            <p className="font-medium">The principle we won&apos;t trade away</p>
            <p className="muted mt-2 max-w-3xl text-sm leading-relaxed">
              Every record belongs to the owner and is private by default. Row-level
              security is enforced in the database, not in application code, so there
              is no code path that can forget the check. Any partner integration is
              an explicit, revocable grant by the owner — never a default, never a
              side effect of signing up.
            </p>
          </div>

          <div className="mt-8">
            <a
              href="mailto:hello@example.com?subject=Petfolio%20partnership"
              className="inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
            >
              Talk to us about integrating
            </a>
            <p className="muted mt-2 text-xs">
              Replace this address with your own before demoing.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- footer ---- */}
      <footer className="mx-auto max-w-5xl px-5 py-12 text-center">
        <p className="text-lg font-semibold tracking-tight">
          Stop keeping your pet&apos;s history in a drawer.
        </p>
        <Link
          href={cta}
          className="mt-5 inline-block rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700"
        >
          {ctaLabel}
        </Link>
        <p className="muted mt-8 text-xs">
          🐾 Petfolio · built at Sundai · animal records are not PHI, and we still
          treat them like they matter
        </p>
      </footer>
    </div>
  );
}
