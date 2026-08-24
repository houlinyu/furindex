import Link from "next/link";
import {
  AMBER_MEANS,
  PART_STATUS_GLYPH,
  PART_STATUS_SHORT,
  PART_STATUS_TONE,
  RECHECK_AFTER_DAYS,
  isDueRecheck,
  type PartState,
} from "@/lib/body-parts";
import { formatDate } from "@/lib/format";

/**
 * Part-by-part status, mirroring the guided health check.
 *
 * Every status on this grid is the OWNER'S assessment quoted back. We have no
 * opinion about any of these body parts and the copy never lets one appear:
 * amber is "you weren't sure", not "needs attention"; rose is "you flagged
 * this", not "this is a problem". The distinction is the difference between a
 * record and a diagnosis, and only the first is something this app can produce.
 *
 * Colour is never the only channel — every tile prints the status in words and
 * a glyph as well.
 */
export default function BodyStatusGrid({
  petId,
  states,
  unavailableReason,
}: {
  petId: string;
  states: PartState[];
  /** Set when the guided-check tables aren't in this deployment yet. */
  unavailableReason?: string | null;
}) {
  const checked = states.filter((s) => s.status !== "unchecked");
  const unsure = states.filter((s) => s.status === "not_sure");
  const due = checked.filter(isDueRecheck);

  return (
    <div>
      {unavailableReason && (
        <p className="card muted mb-3 p-3 text-xs leading-relaxed">{unavailableReason}</p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {states.map((s) => (
          <li key={s.part.id}>
            <Link
              href={`/pets/${petId}/dashboard/parts/${s.part.id}`}
              className={`card flex min-h-20 flex-col justify-between gap-1 border p-3 hover:border-brand-500 ${PART_STATUS_TONE[s.status]}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-[var(--text)]">{s.part.label}</span>
                <span className="shrink-0 text-xs" aria-hidden>
                  {PART_STATUS_GLYPH[s.status]}
                </span>
              </span>
              <span className="text-xs font-medium">{PART_STATUS_SHORT[s.status]}</span>
              <span className="muted text-[0.6875rem]">
                {s.lastChecked
                  ? `Last checked ${formatDate(s.lastChecked)}${
                      isDueRecheck(s) ? " · due another look" : ""
                    }`
                  : s.part.why}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="muted mt-3 text-xs leading-relaxed">
        {AMBER_MEANS} Grey means nobody has looked yet — it is an absence, not a result.
      </p>

      {unsure.length > 0 && (
        <p className="muted mt-1 text-xs leading-relaxed">
          You weren&apos;t sure about {listNames(unsure)}. That is a fine thing to be — a
          second photo on a better-lit day is usually all it takes to decide.
        </p>
      )}

      {due.length > 0 && (
        <p className="muted mt-1 text-xs leading-relaxed">
          {listNames(due)} {due.length === 1 ? "hasn't" : "haven't"} been looked at in{" "}
          {RECHECK_AFTER_DAYS} days. That&apos;s about your routine, not about your pet.
        </p>
      )}
    </div>
  );
}

function listNames(states: PartState[]): string {
  const names = states.map((s) => s.part.label.toLowerCase());
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
