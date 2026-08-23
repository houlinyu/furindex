import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { getUser } from "@/lib/supabase/server";

export const metadata = {
  title: "How Petfolio is different — Petfolio",
  description:
    "An honest look at the pet health market, what the existing categories do well, and the gap none of them fill.",
};

const CATEGORIES = [
  {
    icon: "🏥",
    name: "Clinic-branded owner apps",
    examples: "PetDesk, Vetstoria, practice-portal apps",
    good: "Real clinical data, entered by professionals. Appointment booking and reminders that actually work, because the clinic owns both sides.",
    gap: "The record belongs to that practice. Change vet, move city, use an emergency clinic at 2am, and the history doesn't follow. Owners end up with three portals and no single picture.",
  },
  {
    icon: "⌚",
    name: "Wearables & trackers",
    examples: "Whistle, Fi, Tractive",
    good: "Genuinely good hardware. Continuous, objective signal that no owner could produce by hand — activity, location, sleep, sometimes vitals.",
    gap: "A stream of numbers with no clinical context beside it. Resting heart rate means little without the medication list and the vet's note from March. The data lives in its own app and dies there.",
  },
  {
    icon: "🧬",
    name: "DNA & diagnostics",
    examples: "Embark, Wisdom Panel, lab panels",
    good: "Real science, genuinely useful — breed risk, known variants, a one-off deep read of the animal.",
    gap: "A snapshot, not a trajectory. The result arrives as a PDF and joins the drawer. Nothing connects it to what happens over the following five years, which is where its value actually lies.",
  },
  {
    icon: "🛡️",
    name: "Insurance",
    examples: "Trupanion, Lemonade, Healthy Paws",
    good: "Solves the financial shock, which for many owners is the binding constraint on care.",
    gap: "Holds claims, not health. The data model is built around reimbursement events, and the incentive to share it back with the owner is weak.",
  },
  {
    icon: "📝",
    name: "General pet-care apps",
    examples: "11pets and similar trackers",
    good: "Broad feature coverage, and they do own the owner relationship.",
    gap: "Manual entry. Every vaccination, every dose, typed in by hand — which is why most of these apps are abandoned within a month. Nobody sustains data entry for a healthy animal.",
  },
];

const DIFFS = [
  {
    icon: "📄",
    t: "We read the paperwork you already have",
    b: "Point a phone at the discharge sheet. Vaccinations, dosages, weight, next-due dates come out structured. The competing apps ask you to type it; that's the step where people quit.",
  },
  {
    icon: "🧩",
    t: "The schema grows from your documents",
    b: "Every other app ships a fixed set of fields someone else chose. Accept a measurement off a report — blood glucose, body condition score, dental grade — and it becomes a field you track, and the next report with that label lines up with it automatically.",
  },
  {
    icon: "🔗",
    t: "Owner-held, not practice-held",
    b: "The record is yours and crosses clinics, cities and countries. Every partner integration is an explicit, revocable grant — never a default.",
  },
  {
    icon: "🧾",
    t: "Provenance on every row",
    b: "Each extracted record points back at the document it came from. You can always ask where a number came from — which matters for a claim, a second opinion, or a trial enrolment.",
  },
  {
    icon: "✅",
    t: "Extraction proposes, the owner decides",
    b: "Nothing auto-writes. Low-confidence reads arrive with nothing pre-ticked. We would rather be slower than silently wrong about a dosage.",
  },
];

export default async function ComparePage() {
  const user = await getUser();

  return (
    <div className="min-h-screen">
      <MarketingNav signedIn={!!user} />

      <section className="mx-auto max-w-3xl px-5 pb-10 pt-16">
        <p className="muted text-xs font-medium uppercase tracking-widest">
          The landscape
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Plenty of pet apps. Almost no pet <span className="text-brand-600">records</span>.
        </h1>
        <p className="muted mt-5 text-base leading-relaxed">
          The pet health market is not empty — it is fragmented. Each category holds
          one slice of the picture and has little reason to give it up. Below is what
          each does well, and the specific thing none of them do.
        </p>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-14">
        <div className="space-y-4">
          {CATEGORIES.map((c) => (
            <div key={c.name} className="card p-5">
              <div className="flex items-start gap-4">
                <span className="text-2xl">{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="muted text-xs">{c.examples}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-brand-600">
                        What it does well
                      </p>
                      <p className="muted mt-1 text-sm leading-relaxed">{c.good}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-600">
                        What it leaves open
                      </p>
                      <p className="muted mt-1 text-sm leading-relaxed">{c.gap}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-brand-50/30">
        <div className="mx-auto max-w-4xl px-5 py-14">
          <h2 className="text-xl font-semibold tracking-tight">What&apos;s new here</h2>
          <p className="muted mt-2 max-w-2xl text-sm leading-relaxed">
            One sentence: <strong>we removed the data entry, and we let the record
            take shapes we didn&apos;t design.</strong> Everything below follows from
            those two.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {DIFFS.map((d) => (
              <div key={d.t} className="card p-5">
                <div className="text-2xl">{d.icon}</div>
                <p className="mt-3 text-sm font-medium">{d.t}</p>
                <p className="muted mt-2 text-sm leading-relaxed">{d.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Being straight about this is more persuasive than pretending otherwise. */}
      <section className="mx-auto max-w-3xl px-5 py-14">
        <h2 className="text-xl font-semibold tracking-tight">
          Where we&apos;re genuinely behind
        </h2>
        <p className="muted mt-3 text-sm leading-relaxed">
          A comparison page that claims to win on every axis isn&apos;t worth reading.
          Ours:
        </p>
        <ul className="muted mt-4 space-y-2 text-sm leading-relaxed">
          <li>
            <strong>Distribution.</strong> Clinic apps are handed to owners by their
            vet at the moment of highest intent. We have no such channel yet — which
            is exactly why the clinic partnership matters more to us than to them.
          </li>
          <li>
            <strong>No hardware.</strong> We generate no data of our own. We are a
            place data lands, which makes us dependent on partners who produce it.
          </li>
          <li>
            <strong>Extraction is imperfect.</strong> A blurry photo of a handwritten
            note will not parse cleanly, and we would rather return nothing than a
            confident wrong dosage. That&apos;s a real ceiling on the magic.
          </li>
          <li>
            <strong>We are days old.</strong> The incumbents have years of polish and
            support infrastructure. Judge us on the shape of the idea, not the mileage.
          </li>
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={user ? "/dashboard" : "/login"}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Try the upload
          </Link>
          <Link
            href="/partners"
            className="rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-medium hover:border-brand-500 hover:text-brand-600"
          >
            Partner with us
          </Link>
        </div>
      </section>
    </div>
  );
}
