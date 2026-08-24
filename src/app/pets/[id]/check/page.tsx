/**
 * Block 4, screens 4.2 (Guided Health Check) and 4.3 (How's Your Pet Feeling?).
 *
 * The whole page is written to read as "write down what you can see", never
 * "we are assessing your pet". Concretely, that meant:
 *
 *   - no completion state. Nine cards, no progress bar, no "3 of 9", no nudge
 *     for the six you skipped. Skipping is free and leaves no trace.
 *   - no colour that grades an answer. The three self-assessment options are
 *     styled identically; "something looks off" is the owner's observation, not
 *     an alarm this app raised, and there is no red anywhere on the screen.
 *   - nothing is analysed. `ai_review_status` exists in the schema and is
 *     `pending` on every row; no model runs, and nothing in this UI mentions
 *     review, because implying a review that hasn't happened is the same lie as
 *     hiding one that has.
 *
 * It is a separate route rather than another section on the pet page: nine
 * capture cards and a wellbeing form is a sitting-down-with-the-animal task,
 * and it needs its own framing sentence at the top, which a section buried at
 * scroll position four cannot have.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import HealthCheckCard from "@/components/HealthCheckCard";
import HealthCheckHistory from "@/components/HealthCheckHistory";
import WellbeingNoteForm from "@/components/WellbeingNoteForm";
import WellbeingTimeline from "@/components/WellbeingTimeline";
import { createClient, getUser } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import {
  HEALTH_CHECK_PARTS,
  OPTIMISTIC_MEDIA_SUPPORT,
  mediaSupportFrom,
  type MediaSupport,
} from "@/lib/health-check";
import type { HealthCheck, HealthCheckItem, Pet, WellbeingNote } from "@/lib/types";

/** Enough history to be useful without turning the page into an archive. */
const RECENT_CHECKS = 8;
const RECENT_NOTES = 10;
const SIGNED_URL_TTL = 60 * 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("pets").select("name").eq("id", id).maybeSingle();
  const name = (data as { name: string } | null)?.name;
  return { title: name ? `${name} — health check` : "Health check" };
}

export default async function HealthCheckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();
  const p = pet as Pet;

  const [checkRows, itemRows, noteRows] = await Promise.all([
    supabase
      .from("health_checks")
      .select("*")
      .eq("pet_id", id)
      .order("checked_on", { ascending: false })
      .limit(RECENT_CHECKS + 1),
    supabase
      .from("health_check_items")
      .select("*")
      .eq("pet_id", id)
      .order("captured_at", { ascending: false })
      .limit(200),
    supabase
      .from("wellbeing_notes")
      .select("*")
      .eq("pet_id", id)
      .order("recorded_at", { ascending: false })
      .limit(RECENT_NOTES),
  ]);

  const checks = (checkRows.data ?? []) as HealthCheck[];
  const items = (itemRows.data ?? []) as HealthCheckItem[];
  const notes = (noteRows.data ?? []) as WellbeingNote[];

  // Which check counts as "the one in progress". The rows are stamped with the
  // OWNER's local day and this process's clock is the server's, so the two
  // disagree for part of every day — hence a day of slack either side rather
  // than an equality test, which would silently start a second check for
  // anyone who doesn't live where the app is deployed.
  const current = checks.find((c) => withinADay(c.checked_on)) ?? null;
  const currentItems = current ? items.filter((i) => i.check_id === current.id) : [];
  const byPart = new Map(currentItems.map((i) => [i.part, i]));

  const pastChecks = checks.filter((c) => c.id !== current?.id).slice(0, RECENT_CHECKS);
  const pastIds = new Set(pastChecks.map((c) => c.id));
  const pastItems = items.filter((i) => pastIds.has(i.check_id));

  const support = await detectMediaSupport(supabase);
  const currentUrls = await signCurrentMedia(supabase, currentItems);

  return (
    <AppShell email={user?.email}>
      <Link
        href={`/pets/${p.id}`}
        className="muted inline-flex min-h-11 items-center text-sm hover:text-[var(--brand-text)]"
      >
        ← {p.name}
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">Health check</h1>
        <p className="muted mt-2 max-w-2xl text-sm">
          A few minutes with {p.name} and your phone. You&rsquo;re writing down what you
          can see today — nothing here is graded, scored or diagnosed. The value is
          having something specific to compare against in three months, and something
          concrete to show a vet instead of &ldquo;he&rsquo;s been a bit off&rdquo;.
        </p>
        <p className="muted mt-2 max-w-2xl text-sm">
          Do one part or all nine, in any order. Skipping is free and nothing counts
          what you skipped.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-sm font-medium uppercase tracking-wide muted">
            Today&rsquo;s check
          </h2>
          <p className="muted text-xs">
            {currentItems.length === 0
              ? "Nothing recorded yet"
              : currentItems.length === 1
                ? "1 part recorded"
                : `${currentItems.length} parts recorded`}
            {current && ` · ${formatDate(current.checked_on)}`}
          </p>
        </div>

        <div className="space-y-3">
          {HEALTH_CHECK_PARTS.map((spec) => {
            const item = byPart.get(spec.part) ?? null;
            return (
              <HealthCheckCard
                key={spec.part}
                petId={p.id}
                spec={spec}
                item={item}
                mediaUrl={(item?.media_path && currentUrls.get(item.media_path)) || null}
                support={support}
              />
            );
          })}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          How&rsquo;s {p.name} feeling?
        </h2>
        <p className="muted mb-3 max-w-2xl text-xs">
          The part a photo can&rsquo;t hold. Written down and timestamped, so it can sit
          beside the rest of the record later instead of being a thing you half-remember
          in the waiting room.
        </p>
        <WellbeingNoteForm petId={p.id} support={support} />
        <WellbeingTimeline notes={notes} />
      </section>

      {pastChecks.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
            Earlier checks
          </h2>
          <p className="muted text-xs">
            What you recorded last time, in the same order as the cards above.
          </p>
          <HealthCheckHistory checks={pastChecks} items={pastItems} />
        </section>
      )}

      <p className="muted max-w-2xl text-xs">
        Everything on this page is your own record of your own animal. Nothing on it is
        analysed, scored or shared, and if something you wrote down worries you, the
        next step is mentioning it to your vet.
      </p>
    </AppShell>
  );
}

/** True when a stored local day is within a day of the server's — see above. */
function withinADay(day: string): boolean {
  const serverToday = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const stored = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(stored)) return false;
  return Math.abs(stored - serverToday) <= 86_400_000;
}

/**
 * What the shared private bucket will currently accept. Photos always; video
 * and audio only once the bucket's allowed_mime_types has been widened by the
 * separate media work. If the configuration can't be read at all — RLS on
 * storage.buckets makes that the normal case for an anon key — the UI stays
 * optimistic and lets the upload itself be the source of truth, because
 * guessing "no" would hide a feature that works.
 */
async function detectMediaSupport(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<MediaSupport> {
  try {
    const { data, error } = await supabase.storage.getBucket("vet-reports");
    if (error || !data) return OPTIMISTIC_MEDIA_SUPPORT;
    return mediaSupportFrom(data.allowed_mime_types);
  } catch {
    return OPTIMISTIC_MEDIA_SUPPORT;
  }
}

/** One batch for every card on the page, not one round trip per card. */
async function signCurrentMedia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: HealthCheckItem[]
): Promise<Map<string, string>> {
  const paths = [...new Set(items.map((i) => i.media_path).filter((p): p is string => !!p))];
  if (paths.length === 0) return new Map();

  const { data } = await supabase.storage.from("vet-reports").createSignedUrls(paths, SIGNED_URL_TTL);
  const urls = new Map<string, string>();
  for (const r of data ?? []) {
    if (!r.error && r.path && r.signedUrl) urls.set(r.path, r.signedUrl);
  }
  return urls;
}
