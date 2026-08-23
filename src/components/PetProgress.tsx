import Link from "next/link";
import type { Pet } from "@/lib/types";

/**
 * "How much is in this record, and what would add the most" — for the top of a
 * pet page.
 *
 * WHY IT IS NOT A COMPLETION SCORE
 * A percentage implies a target, a target implies failing to hit it, and the
 * thing being scored here is somebody's animal. An owner with a healthy pet and
 * three records is not behind on anything. So this component is constrained:
 *
 *   - It counts what is *present*, and never names what is absent as a lack.
 *     The word "missing" does not appear, and neither does a red state.
 *   - It suggests exactly ONE next thing, with the reason it helps. A checklist
 *     of eight unticked boxes is a chore; one suggestion is a tip.
 *   - It stops. Past `ENOUGH` it drops the suggestion and says the record is in
 *     good shape, and at full marks it renders nothing at all. Progress UI that
 *     never goes away has turned into nagging.
 *   - It says out loud that a short record is not a worse record, because that
 *     is true and because it is the sentence that stops the meter from reading
 *     as a judgement.
 *
 * Server component: pure arithmetic over rows the page has already fetched.
 */

/** Milestones, in the order they are worth suggesting. */
type Milestone = {
  key: string;
  /** Present tense, describes what the record HAS. */
  have: string;
  /** The suggestion, if this is the one we pick. Imperative but soft. */
  suggest: string;
  /** Why it helps — never "so your record isn't incomplete". */
  because: string;
  /**
   * Where the suggestion actually happens. Naming a next step without a way to
   * reach it just moves the work to the reader — they have to scroll a long page
   * and guess which of nine sections was meant.
   */
  href: string;
  /** What the button says. Names the destination, not "Go".  */
  cta: string;
  done: boolean;
};

/**
 * At this many milestones the record can already answer the questions a vet
 * asks, so the suggestion is withdrawn. Below a hard number rather than a
 * fraction so adding a milestone later doesn't silently move the goalposts for
 * everyone who had already got there.
 */
const ENOUGH = 4;

export default function PetProgress({
  pet,
  hasPhoto,
  weightCount,
  recordCount,
  observationCount,
  documentCount,
}: {
  pet: Pet;
  hasPhoto: boolean;
  /** Rows in weight_logs. */
  weightCount: number;
  /** Vaccinations + medications + vet visits — the clinical spine. */
  recordCount: number;
  /** Journal entries + activity taps — anything the owner noticed. */
  observationCount: number;
  /** Uploaded documents. */
  documentCount: number;
}) {
  const milestones: Milestone[] = [
    {
      key: "identity",
      have: "Name and species",
      suggest: "",
      because: "",
      href: "",
      cta: "",
      // Always true: the pet cannot exist without them. Counted so the meter
      // never starts at zero — nobody's first look should be an empty bar.
      done: true,
    },
    {
      key: "details",
      have: "Breed and birth date",
      suggest: "Add a breed and rough birth date",
      because:
        "it turns on the breed notes, and lets every later reading be read against an age.",
      href: `/pets/${pet.id}/edit`,
      cta: "Edit details",
      done: !!pet.breed && !!pet.birth_date,
    },
    {
      key: "weight",
      have: "A weight reading",
      suggest: `Weigh ${pet.name} and log it`,
      because:
        "weight is the one number that moves early and is easy to measure at home.",
      href: "#records-weight",
      cta: "Log a weight",
      done: weightCount > 0,
    },
    {
      key: "records",
      have: "Vet records",
      suggest: "Add one vaccination, medication or visit",
      because: "it is what makes this record usable at an appointment.",
      href: "#records",
      cta: "Add a record",
      done: recordCount > 0,
    },
    {
      key: "observations",
      have: "Day-to-day notes",
      suggest: "Tap today's activity, or note one thing you saw",
      because:
        "a run of small dated notes is the history nobody can reconstruct from memory.",
      href: "#activity",
      cta: "Log today",
      done: observationCount > 0,
    },
    {
      key: "paperwork",
      have: "Paperwork on file",
      suggest: "Add a photo of a vet report or vaccination card",
      because: "it is the fastest way in — one upload can fill several of these.",
      href: "#documents",
      cta: "Add a document",
      done: documentCount > 0 || hasPhoto,
    },
  ];

  const doneCount = milestones.filter((m) => m.done).length;
  const total = milestones.length;

  // Nothing left to say. Silence is the correct end state.
  if (doneCount === total) return null;

  const settled = doneCount >= ENOUGH;
  // The first thing not yet done, in the order above — which is deliberately
  // ordered cheapest-and-most-useful first.
  const next = milestones.find((m) => !m.done && m.suggest);

  return (
    <section className="card mb-8 p-5" aria-labelledby="pet-progress-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="pet-progress-heading" className="text-sm font-medium">
          {pet.name}&apos;s record so far
        </h2>
        <p className="muted text-xs tabular-nums">
          {doneCount} of {total}
        </p>
      </div>

      {/* Decoration: the same information is in the count above and the list
          below, both of which a screen reader reads properly. */}
      <div className="mt-3 flex gap-1" aria-hidden>
        {milestones.map((m) => (
          <span
            key={m.key}
            className={`h-1.5 flex-1 rounded-full ${
              m.done ? "bg-brand-500" : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      <p className="mt-3 text-sm leading-relaxed">
        {settled ? (
          <>
            This record is in good shape — there is enough here to be useful at an
            appointment.{" "}
            <span className="muted">
              Anything else you add just gives you more to look back on.
            </span>
          </>
        ) : (
          <>
            <span className="muted">On file already: </span>
            {milestones
              .filter((m) => m.done)
              .map((m) => m.have.toLowerCase())
              .join(", ")}
            .
          </>
        )}
      </p>

      {!settled && next && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] pt-4">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{next.suggest}</span>{" "}
            <span className="muted">— {next.because}</span>
          </p>
          <Link
            href={next.href}
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            {next.cta}
          </Link>
        </div>
      )}

      {/* The sentence that keeps the meter from reading as a verdict on
          somebody's care. It is also simply true. */}
      <p className="muted mt-3 text-xs leading-relaxed">
        A short record is not a worse record. Plenty of healthy animals need very
        little written down — this is only a note of what is here, never a
        measure of how they are looked after.
      </p>
    </section>
  );
}
