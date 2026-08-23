import { getBreedFacts, BREED_API_ATTRIBUTION } from "@/lib/breed-api";

/**
 * Compact breed reference card, rendered from third-party reference data.
 *
 * This is an async SERVER component: the API key never reaches the browser, and
 * the underlying fetch is cached for 30 days so this costs nothing on a warm
 * render.
 *
 * It renders NOTHING (not a placeholder, not an error, not a skeleton) whenever
 * we don't have a confident match — unsupported species, no API key configured,
 * upstream down, mixed breed, or an ambiguous name. Silence is deliberate:
 * showing Siamese facts next to a mixed-breed cat is a worse outcome than an
 * absent card, and an owner reading a health app should never have to wonder
 * whether the facts are about their animal.
 */
export default async function BreedFacts({
  species,
  breed,
}: {
  species: string;
  breed: string | null | undefined;
}) {
  const facts = await getBreedFacts(species, breed);
  if (!facts) return null;

  const credit = BREED_API_ATTRIBUTION[facts.species];

  // Only the first sentence: the card is a glance, not an encyclopedia entry.
  const oneLine = facts.description
    ? (facts.description.match(/^.*?[.!?](\s|$)/)?.[0] ?? facts.description).trim()
    : null;

  // Skip the whole stat row rather than render a lone dangling label.
  const stats = [
    facts.lifeSpan ? { label: "Typical life span", value: facts.lifeSpan } : null,
    facts.weight ? { label: "Typical weight", value: facts.weight } : null,
    facts.origin ? { label: "Origin", value: facts.origin } : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

  return (
    <section aria-labelledby="breed-facts-heading" className="card mb-8 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="breed-facts-heading" className="text-sm font-medium tracking-tight">
          {facts.name}
        </h2>
        <p className="muted text-xs uppercase tracking-wide">Breed reference</p>
      </div>

      {oneLine && <p className="muted mt-2 text-sm leading-relaxed">{oneLine}</p>}

      {facts.temperament.length > 0 && (
        <>
          {/* The visible chips read as decoration; name the group for screen readers. */}
          <h3 className="sr-only" id="breed-temperament-heading">
            Typical temperament
          </h3>
          <ul
            aria-labelledby="breed-temperament-heading"
            className="mt-3 flex flex-wrap gap-1.5"
          >
            {facts.temperament.map((trait) => (
              <li
                key={trait}
                className="rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-xs text-brand-700 dark:border-[var(--border)] dark:bg-transparent dark:text-brand-300"
              >
                {trait}
              </li>
            ))}
          </ul>
        </>
      )}

      {stats.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="muted text-xs">{s.label}</dt>
              <dd className="mt-0.5 text-sm">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {facts.didYouKnow && (
        <p className="mt-4 border-l-2 border-brand-300 pl-3 text-sm leading-relaxed">
          <span className="muted">Did you know </span>
          {facts.didYouKnow}
        </p>
      )}

      {facts.healthNotes && (
        <p className="muted mt-3 text-xs leading-relaxed">{facts.healthNotes}</p>
      )}

      {/* Required by the API's terms of service — see BREED_API_ATTRIBUTION. */}
      <p className="muted mt-4 border-t border-[var(--border)] pt-3 text-xs">
        Breed data from{" "}
        <a
          href={credit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-[var(--brand-text)]"
        >
          {credit.label}
        </a>
        {facts.wikipediaUrl && (
          <>
            {" · "}
            <a
              href={facts.wikipediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-[var(--brand-text)]"
            >
              Wikipedia
            </a>
          </>
        )}
        . General breed traits, not a description of your pet.
      </p>
    </section>
  );
}
