import Link from "next/link";
import AppShell from "@/components/AppShell";
import FirstRun from "@/components/FirstRun";
import ReportUpload from "@/components/ReportUpload";
import DailyFactPanel from "@/components/DailyFactPanel";
import SampleReportButton from "@/components/SampleReportButton";
import PetAvatar from "@/components/PetAvatar";
import SearchBox from "@/components/SearchBox";
import ReminderList from "@/components/ReminderList";
import { todayISO } from "@/lib/reminders";
import { signedPetPhotoUrls } from "@/lib/photos";
import { createClient, getUser } from "@/lib/supabase/server";
import { SPECIES_EMOJI, ageFromBirthDate, daysUntil, formatDate } from "@/lib/format";
import type { CareReminder, Pet, Vaccination } from "@/lib/types";

export default async function DashboardPage() {
  const user = await getUser();
  const supabase = await createClient();

  const [{ data: pets }, { data: dueVaccines }, { data: dueReminders }] = await Promise.all([
    supabase.from("pets").select("*").order("created_at", { ascending: true }),
    supabase
      .from("vaccinations")
      .select("*")
      .not("due_on", "is", null)
      // Without a floor, an owner with many dated vaccines fills the 20-row
      // window with long-past rows and never sees what's actually coming up.
      .gte("due_on", new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10))
      .order("due_on", { ascending: true })
      .limit(20),
    // No pet filter: RLS already scopes this to the owner, and the partial index
    // on (owner_id, due_on) where is_active serves exactly this cross-pet query.
    supabase
      .from("care_reminders")
      .select("*")
      .eq("is_active", true)
      .lte("due_on", new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10))
      .order("due_on", { ascending: true })
      .limit(50),
  ]);

  const extractionEnabled = !!process.env.ANTHROPIC_API_KEY;
  const petList = (pets ?? []) as Pet[];
  const petNameById = new Map(petList.map((p) => [p.id, p.name]));
  const photoUrls = await signedPetPhotoUrls(supabase, petList);
  const upcoming = ((dueVaccines ?? []) as Vaccination[])
    .filter((v) => v.due_on && daysUntil(v.due_on) <= 60)
    .slice(0, 6);
  // A no-pets account gets a different page, not the normal page with holes in
  // it. Every section below that can only show an absence is suppressed.
  const isFirstRun = petList.length === 0;

  return (
    <AppShell email={user?.email}>
      {/* `items-end` with no wrap let the button sit on top of the subtitle at
          375px. Wrapping, and giving the text a basis, keeps both readable. */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 grow basis-56">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isFirstRun ? "Welcome to FurIndex" : "Dashboard"}
          </h1>
          {/* On first run the block below opens with its own summary line, so a
              second one here would just be the same sentence twice. */}
          {!isFirstRun && (
            <p className="muted mt-1 text-sm">
              {petList.length} pet{petList.length === 1 ? "" : "s"} under your care.
            </p>
          )}
        </div>
        {/* While the first-run block is on screen it already carries the one
            primary action; a second identical button just splits attention. */}
        {!isFirstRun && (
          <Link
            href="/pets/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add pet
          </Link>
        )}
      </div>

      {petList.length > 0 && (
        <div className="mb-8">
          <SearchBox />
        </div>
      )}

      {isFirstRun ? (
        // The vet-report panel is the loudest thing on the page and, with no
        // pets, it has nothing to attach a report to — on a deployment without
        // an API key it opens with an apology, which is a poor first sentence.
        // The sample it offers is folded into the first-run block instead.
        <FirstRun sampleEnabled />
      ) : (
        <>
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">
              Add a vet report
            </h2>

            {extractionEnabled ? (
              <>
                <ReportUpload pets={petList} />
                <p className="muted mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span>
                    A PDF or a photo of the paperwork. We read the vaccinations,
                    medications, weight and dates out of it, and you confirm what gets
                    saved.
                  </span>
                  <SampleReportButton primary={false} />
                </p>
              </>
            ) : (
              <div className="card p-6">
                <p className="text-sm font-medium">
                  📄 See how a report becomes a record
                </p>
                <p className="muted mt-2 max-w-xl text-sm leading-relaxed">
                  Automatic reading of your own uploads needs an Anthropic API key,
                  which isn&apos;t configured on this deployment. The sample below runs
                  the identical review-and-confirm flow on a real-world vet report, so
                  you can see exactly what the feature does.
                </p>
                <div className="mt-4">
                  <SampleReportButton primary />
                </div>
                <p className="muted mt-3 text-xs">
                  You can add records by hand at any time — everything else on this page
                  works normally.
                </p>
              </div>
            )}
          </section>

          <section className="mb-8">
            <DailyFactPanel />
          </section>
        </>
      )}

      {!isFirstRun && (
        <>
          <section className="mb-10">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">
              Due care
            </h2>
            <ReminderList
              reminders={(dueReminders ?? []) as CareReminder[]}
              today={todayISO()}
              petNames={Object.fromEntries(petNameById)}
              showPetNames
              limit={5}
              emptyMessage="Nothing due across your pets."
            />
          </section>

          <section className="mb-10">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">
              Coming up
            </h2>
            {upcoming.length === 0 ? (
              <div className="card muted px-4 py-6 text-center text-sm">
                Nothing due in the next 60 days. 🎉
              </div>
            ) : (
              <ul className="card divide-y divide-[var(--border)]">
                {upcoming.map((v) => {
                  const days = daysUntil(v.due_on!);
                  const overdue = days < 0;
                  return (
                    <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          overdue ? "bg-red-500" : days <= 14 ? "bg-amber-500" : "bg-brand-500"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{v.name}</p>
                        <p className="muted text-xs">
                          {petNameById.get(v.pet_id) ?? "Pet"} · due {formatDate(v.due_on)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-medium ${
                          overdue ? "text-red-600" : "muted"
                        }`}
                      >
                        {overdue
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                            ? "today"
                            : `in ${days}d`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">
              Your pets
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {petList.map((pet) => (
                <Link
                  key={pet.id}
                  href={`/pets/${pet.id}`}
                  className="card flex items-center gap-4 p-4 transition hover:border-brand-300"
                >
                  <PetAvatar pet={pet} photoUrl={photoUrls[pet.id] ?? null} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{pet.name}</p>
                    <p className="muted truncate text-xs">
                      {[pet.breed, ageFromBirthDate(pet.birth_date)]
                        .filter(Boolean)
                        .join(" · ") || "No details yet"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
