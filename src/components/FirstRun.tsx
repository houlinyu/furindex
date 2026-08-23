import Link from "next/link";
import SampleReportButton from "@/components/SampleReportButton";
import FunnelResume from "@/components/FunnelResume";

/**
 * What a brand-new account sees instead of an empty dashboard.
 *
 * WHY THIS SHAPE
 * The measured failure mode in this category is abandonment at the data-entry
 * wall: someone signs up, is shown a set of blank containers, and never comes
 * back. The counter is a first session that produces something worth keeping,
 * so this block is built to answer, in order, the three questions that decide
 * whether someone types anything at all:
 *
 *   1. What is this for?          — the lead sentence, in plain words
 *   2. What does it cost me?      — "name and species", "about a minute"
 *   3. Can I look before I type?  — the sample report, one click, no data
 *
 * WHY IT IS NOT A MODAL OR A WIZARD
 * Both get dismissed, and a dismissed onboarding teaches nothing. This is just
 * the page: it occupies the space the dashboard would otherwise waste, and it
 * disappears on its own the moment there is a pet to show. Nobody has to close
 * it, and nobody can lose it by closing it.
 *
 * The three steps below are described, not enforced — there is no gating, no
 * progress bar and no "step 1 of 3". They exist so the reader can decide
 * whether the whole thing is worth ten minutes before spending one.
 */

/** Deliberately three, deliberately small. A longer list reads as a chore. */
const FIRST_WEEK = [
  {
    what: "Add your pet",
    why: "Name and species. Everything else can wait, or arrive from a vet report.",
    cost: "about a minute",
  },
  {
    what: "Tap today's activity",
    why: "One tap, once a day. It is what later turns into a trend worth looking at.",
    cost: "seconds",
  },
  {
    what: "Add one real record",
    why: "A vaccination, a weight, or a photo of the paperwork. One is enough to start.",
    cost: "a couple of minutes",
  },
];

export default function FirstRun({ sampleEnabled }: { sampleEnabled: boolean }) {
  return (
    <section className="card overflow-hidden">
      <div className="p-6 sm:p-8">
        {/* If the landing-page funnel carried an answer in, say so before the
            pitch: being asked the same question twice is what makes a signed-up
            visitor feel the sign-up lost their place. Renders nothing when there
            is no funnel state, which is the ordinary first run. */}
        <FunnelResume />
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          A health record for your pet that a vet can actually read
        </h2>
        <p className="muted mt-2 max-w-xl text-sm leading-relaxed">
          Vaccinations, weight, medications and the small things you notice, kept in
          one place and in date order. So when someone asks when it started, the
          answer is a record rather than a guess.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href="/pets/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add your first pet
          </Link>
          {/* The look-before-you-type path. Kept visually quieter than the
              primary action so it reads as an alternative, not a fork. */}
          {sampleEnabled && <SampleReportButton primary={false} />}
        </div>
        <p className="muted mt-3 text-xs">
          Name and species is all the form needs. You can fill in the rest whenever,
          or let a vet report fill it in for you.
        </p>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--bg)] p-6 sm:p-8">
        <h3 className="text-sm font-medium">What the first week looks like</h3>
        <ol className="mt-3 space-y-3">
          {FIRST_WEEK.map((step, i) => (
            <li key={step.what} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-xs font-medium"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {step.what}
                  <span className="muted font-normal"> — {step.cost}</span>
                </p>
                <p className="muted mt-0.5 text-sm leading-relaxed">{step.why}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
