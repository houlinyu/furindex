import {
  NO_OBSERVATIONS,
  OBSERVATION_CAVEAT,
  worthMentioningLine,
  type Observation,
} from "@/lib/observations";

/**
 * Two independent things you recorded, in the same window. Described, and then
 * nothing else.
 *
 * There is no severity here, no score, no colour, and no "worth a vet visit".
 * The single piece of advice this dashboard allows itself is behind a
 * disclosure the owner has to open, and even then it only says what to mention
 * at a visit that already exists.
 *
 * The reason is on the record: Gruen et al. (2017), n=98 cats, found mean
 * activity did not differ between arthritic and healthy animals (p = 0.541),
 * and the cats in more pain were MORE active during the day. "Activity is down,
 * something is wrong" is not a supported inference, so this panel never makes
 * it — or any of its cousins.
 */
export default function ObservationsPanel({
  observations,
}: {
  observations: Observation[];
}) {
  if (observations.length === 0) {
    return <p className="card muted p-4 text-xs leading-relaxed">{NO_OBSERVATIONS}</p>;
  }

  return (
    <div className="card p-4">
      <ul className="space-y-3">
        {observations.map((o) => (
          <li key={o.id}>
            <p className="text-sm leading-relaxed">{o.sentence}</p>
            <p className="muted mt-1 text-[0.6875rem]">
              Two different records:{" "}
              {o.signals.map((s) => STREAM_NAME[s.stream]).join(" and ")}.
            </p>
          </li>
        ))}
      </ul>

      <p className="muted mt-3 border-t border-[var(--border)] pt-3 text-xs leading-relaxed">
        {OBSERVATION_CAVEAT}
      </p>

      <details className="mt-2">
        <summary className="muted cursor-pointer text-xs underline underline-offset-4">
          Worth mentioning to a vet?
        </summary>
        <p className="muted mt-2 text-xs leading-relaxed">
          {worthMentioningLine(observations)}
        </p>
      </details>
    </div>
  );
}

/** Plain names for the streams, so "independent" is something you can check. */
const STREAM_NAME: Record<string, string> = {
  "activity-tap": "your daily activity taps",
  scale: "the scale",
  journal: "your journal",
  "feeding-log": "the feeding log",
  "wellbeing-checkin": "your daily check-in",
};
