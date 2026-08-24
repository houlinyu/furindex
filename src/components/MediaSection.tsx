import MediaCapture from "@/components/MediaCapture";
import MediaTimeline from "@/components/MediaTimeline";
import { createClient } from "@/lib/supabase/server";
import { isMissingTableError } from "@/lib/media";
import type { PetMedia } from "@/lib/types";

/**
 * The whole block, in one drop-in. `<MediaSection petId={p.id} />` is all the
 * pet page needs.
 *
 * It fetches its own rows rather than taking them as a prop so that wiring it
 * in costs one line and no edit to the page's Promise.all. If you'd rather it
 * joined that batch later, lift the query out and pass `rows` to
 * <MediaTimeline> directly — that component is already prop-driven.
 */
export default async function MediaSection({ petId }: { petId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pet_media")
    .select("*")
    .eq("pet_id", petId)
    // Several clips commonly share a day; without the created_at tiebreak their
    // order flips between renders.
    .order("recorded_on", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as PetMedia[];
  // The pet_media migration in supabase/schema.sql hasn't been applied to this
  // project yet. Said plainly, because the alternative is a form that accepts
  // an owner's voice note and then loses it. See isMissingTableError for why
  // this is not just a 42P01 check.
  const notMigrated = isMissingTableError(error);

  return (
    <section id="media" className="mb-8 scroll-mt-20">
      <h2 className="muted mb-1 text-sm font-medium uppercase tracking-wide">
        Photos, video &amp; voice notes
      </h2>
      <p className="muted mb-3 text-xs">
        What they look like on a normal day, a clip of the thing you noticed, and
        what&apos;s been going on in your own words. Dated, tagged and searchable, so
        &ldquo;when did that start?&rdquo; has an answer.
      </p>

      {notMigrated ? (
        <p className="card p-4 text-sm text-amber-700 dark:text-amber-400" role="status">
          Media isn&apos;t set up on this database yet — the <code>pet_media</code>{" "}
          migration at the end of <code>supabase/schema.sql</code> still needs to be run.
        </p>
      ) : (
        <>
          <MediaCapture petId={petId} />
          {error ? (
            <p className="muted text-sm" role="status">
              Couldn&apos;t load the timeline just now. Nothing has been lost — reload
              to try again.
            </p>
          ) : rows.length === 0 ? (
            // MediaTimeline renders nothing for an empty set, which on a new pet
            // leaves the form floating above blank space and no indication that
            // a timeline is what appears underneath it.
            <p className="muted text-sm" role="status">
              Nothing here yet. The first photo is the useful one — it is what
              everything later gets compared against.
            </p>
          ) : (
            <MediaTimeline rows={rows} />
          )}
        </>
      )}
    </section>
  );
}
