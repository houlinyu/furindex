import Link from "next/link";
import {
  BLOCK_COUNT,
  PROFILE_BLOCKS,
  answeredSummary,
  blockIndexById,
  profileProgress,
} from "@/lib/pet-profile";
import type { Pet, PetProfile } from "@/lib/types";

/**
 * The end of the flow: what was recorded, and a way back into any of it.
 *
 * Server component — pure arithmetic over one row. It deliberately shows only
 * what the owner DID answer. A list of the blocks they skipped, with the
 * skipped ones marked, would turn an optional questionnaire into a checklist
 * with unticked boxes, which is the one thing this flow is built not to be.
 */
export default function ProfileReview({
  pet,
  profile,
}: {
  pet: Pet;
  profile: PetProfile | null;
}) {
  const summary = answeredSummary(profile);
  const progress = profileProgress(profile);

  return (
    <section className="card p-5 sm:p-6">
      <p className="muted text-xs uppercase tracking-wide">Pet profile</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        That&apos;s {pet.name}&apos;s profile
      </h1>
      <p className="muted mt-1 text-sm leading-relaxed">
        {summary.length
          ? "Here's what you told us. Change any of it whenever you like — it's all editable, and nothing here is fixed."
          : "You went through all of it without answering anything, which is a perfectly good outcome. It's here whenever you want it."}
      </p>

      {summary.length > 0 && (
        <dl className="mt-6 space-y-5">
          {summary.map((block) => (
            <div key={block.blockId} className="border-t border-[var(--border)] pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-sm font-medium">{block.title}</h2>
                <Link
                  href={`/pets/${pet.id}/profile?block=${blockIndexById(block.blockId)}`}
                  className="muted inline-flex min-h-11 items-center text-xs underline underline-offset-4 hover:text-[var(--brand-text)]"
                >
                  Change
                </Link>
              </div>
              {block.lines.map((line) => (
                <div key={line.prompt} className="mt-1">
                  <dt className="muted text-xs">{line.prompt}</dt>
                  <dd className="text-sm leading-relaxed">{line.value}</dd>
                </div>
              ))}
            </div>
          ))}
        </dl>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
        <Link
          href={`/pets/${pet.id}`}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Back to {pet.name}
        </Link>
        <Link
          href={`/pets/${pet.id}/profile?block=0`}
          className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-4 text-sm hover:border-brand-500 hover:text-[var(--brand-text)]"
        >
          Go through it again
        </Link>
        <p className="muted ml-auto text-xs tabular-nums">
          {progress.done} of {BLOCK_COUNT} blocks visited
        </p>
      </div>

      {/* Same reason PetProgress says it: a short answer set is not a worse one,
          and the sentence is what stops the count above reading as a mark. */}
      <p className="muted mt-4 text-xs leading-relaxed">
        None of this is required, and nothing is worked out from it. It&apos;s a
        description of your animal in your own words —{" "}
        {PROFILE_BLOCKS.length} short blocks, answered as much or as little as suits you.
      </p>
    </section>
  );
}
