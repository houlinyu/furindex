import { SOURCE_LABEL, SOURCE_TONE, type MetricSource } from "@/lib/dashboard";

/**
 * The provenance badge. It is on every card without exception.
 *
 * The spec's rule — "do not blur objective sensor data with subjective owner
 * input" — only works if the label is impossible to miss and impossible to
 * mistake, so this is text, not an icon, and it sits in the card header rather
 * than in a footnote. `Kpi.source` is a required field precisely so that a card
 * cannot exist without one of these.
 */
export default function SourceBadge({
  source,
  origin,
}: {
  source: MetricSource;
  /** The specific origin, announced to screen readers with the badge. */
  origin?: string | null;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium leading-5 ${SOURCE_TONE[source]}`}
      title={origin ?? undefined}
    >
      <span className="sr-only">Source: </span>
      {SOURCE_LABEL[source]}
      {origin && <span className="sr-only"> — from {origin}</span>}
    </span>
  );
}
