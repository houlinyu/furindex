import Link from "next/link";
import MarketingNav from "@/components/MarketingNav";
import { getUser } from "@/lib/supabase/server";

export const metadata = {
  title: "How FurIndex is different — FurIndex",
  description:
    "An honest look at the pet health market, what the existing categories do well, and the gap none of them fill.",
};

const CATEGORIES_HEAD = [
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
    examples: "Tractive (1.4M+ users), Fi, FitBark, PetPace",
    good: "Genuinely good hardware. Continuous, objective signal no owner could produce by hand — activity, location, sleep, and on a couple of devices real vitals.",
    gap: "Closed silos, and the data dies with the device. Mars sold Whistle to Tractive in 2025 and every Whistle collar was switched off on 31 August 2025. Tractive has no public API at all. Fi's is undocumented and caps history at 90 days. Owners are told their pet's history matters, then given no way to keep it.",
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

const EXTRACTION_NOTE = {
  icon: "🤖",
  name: "AI record-scanning apps",
  examples: "MyPetID, VetGPT, AnimalDossier, PetVax AI, VetKeep, PawsAI, PetRecord.ai",
  good: "They do the same core trick we do — photograph a vet document, get structured records. Several are free. MyPetID is free permanently, funded by brand partnerships.",
  gap: "Most auto-save whatever the model returned. VetKeep advertises \u201cNo manual entry\u201d; PawsAI is \u201cone tap to save.\u201d Extraction runs 95\u201399% on clean print but 65\u201390% on handwriting \u2014 and vaccine cards are usually handwritten. Every one of them also has a fixed schema you cannot extend.",
};

const DIFFS = [
  {
    icon: "✅",
    t: "Extraction proposes. You decide.",
    b: "This is the whole argument, so here are the numbers. Extraction runs 95–99% on clean print, 65–90% on handwriting, 60–85% on prescriptions — and vaccine cards are handwritten. Veterinary AI has documented cases of invented drug names and a dose calculated for a 60lb dog given to a 9lb Yorkie. A model that reads 0.5 mg as 5 mg must never write that to a medication record unseen. Competitors advertise one-tap saving; we show you every line, and low-confidence reads arrive with nothing pre-ticked.",
  },
  {
    icon: "🧩",
    t: "The schema grows from your documents",
    b: "Accept a measurement off a report — blood glucose, body condition score, dental grade — and it becomes a field you track, with the next report carrying that label lining up automatically. Apps with custom fields have no extraction; apps with extraction have fixed schemas. We could not find one with both.",
  },
  {
    icon: "🔓",
    t: "Your data leaves when you do",
    b: "The loudest complaint in this market is not typing — it is losing access. Owners of one 500k-install app woke up to their pets' history behind a new paywall. A million Whistle collars were switched off in August 2025. Portability is the promise that actually matters here.",
  },
  {
    icon: "🧾",
    t: "Provenance on every row",
    b: "Each extracted record points back at the document it came from, so you can always ask where a number came from — for a claim, a second opinion, or a trial enrolment.",
  },
];

const CATEGORIES = [EXTRACTION_NOTE, ...CATEGORIES_HEAD];

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
          Reading the paperwork is the easy part.
          <br />
          <span className="text-brand-600">Being trusted with it isn&apos;t.</span>
        </h1>
        <p className="muted mt-5 text-base leading-relaxed">
          We checked, honestly. As of August 2026 at least a dozen apps already
          extract vet documents with AI, and one company sells it as an API to
          anyone who wants it. So &ldquo;we use AI to read vet records&rdquo; is not a
          claim worth making. Here is the real landscape, and the narrower thing we
          think is actually ours.
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

      <section className="border-y border-[var(--border)] bg-brand-50/30">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="text-xl font-semibold tracking-tight">
            The lane that is actually empty
          </h2>
          <p className="muted mt-3 text-sm leading-relaxed">
            Almost every pet app with real scale is one your vet chose for you.
            PetDesk has over a million installs and is entirely clinic-gated: no
            participating clinic, no records — and changing vets means losing them.
            VitusVet has a six-figure install base and has not shipped an iOS
            release since April 2023.
          </p>
          <p className="muted mt-3 text-sm leading-relaxed">
            Owner-held records at scale is a lane with almost nobody in it. Two apps
            have meaningful users; every other entrant is under a thousand installs.
            That is not because the idea is bad — it is because owner-held records
            are hard to fill without a clinic feeding them. Reading the owner&apos;s
            own paperwork is the way in, which is why a dozen teams are suddenly
            trying it.
          </p>
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
            <strong>Our core feature is not rare.</strong> A dozen apps extract vet
            documents, and Pawssier sells the capability as an API, so any incumbent
            can add it in a weekend. What we are betting on is not the trick — it is
            the handling of it.
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
