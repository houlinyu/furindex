import type { UntrackedMetric } from "@/lib/dashboard";

/**
 * The metrics with nothing behind them.
 *
 * These are rendered as a list of sentences, NOT as cards with a dash where the
 * number goes. That is the whole design decision: a card is the shape of a
 * reading, and an owner scanning a grid reads "Heart rate —" as a reading that
 * failed rather than as a metric that does not exist here. A sentence cannot be
 * misread that way.
 *
 * They are listed at all, rather than silently omitted, because an owner who
 * has seen a wearable dashboard will go looking for heart rate, and "we don't
 * have it, and here's why" is a better answer than a gap they have to
 * interpret. Nothing in the copy offers a connect flow: spec 4.1a is blocked,
 * there is no integration to send anyone to, and this repo's rule is not to
 * promise integrations it hasn't built.
 */
export default function NotTracked({ metrics }: { metrics: UntrackedMetric[] }) {
  if (metrics.length === 0) return null;

  const device = metrics.filter((m) => m.needsDevice);
  const soft = metrics.filter((m) => !m.needsDevice);

  return (
    <div className="card p-4">
      <p className="text-sm font-medium">Not tracked</p>
      <p className="muted mt-1 text-xs leading-relaxed">
        No card, no zero, no estimate. Each of these has nothing behind it right now,
        and a number we made up would be worse than an empty space.
      </p>

      {soft.length > 0 && (
        <dl className="mt-3 space-y-2.5">
          {soft.map((m) => (
            <div key={m.key}>
              <dt className="text-xs font-medium">{m.label}</dt>
              <dd className="muted text-xs leading-relaxed">{m.reason}</dd>
            </div>
          ))}
        </dl>
      )}

      {device.length > 0 && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <p className="muted text-[0.6875rem] uppercase tracking-wide">
            Needs hardware we don&apos;t talk to
          </p>
          <dl className="mt-2 space-y-2.5">
            {device.map((m) => (
              <div key={m.key}>
                <dt className="text-xs font-medium">{m.label}</dt>
                <dd className="muted text-xs leading-relaxed">{m.reason}</dd>
              </div>
            ))}
          </dl>
          <p className="muted mt-3 text-[0.6875rem] leading-relaxed">
            There is no &ldquo;connect a device&rdquo; button here on purpose. Web Bluetooth
            doesn&apos;t exist on iOS and no consumer pet collar exposes a public profile, so
            there is no integration to offer — and offering one we haven&apos;t built would be
            the same lie as printing a number we don&apos;t have.
          </p>
        </div>
      )}
    </div>
  );
}
