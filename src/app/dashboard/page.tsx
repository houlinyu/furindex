import Link from "next/link";
import AppShell from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import ReportUpload from "@/components/ReportUpload";
import DailyFactPanel from "@/components/DailyFactPanel";
import SampleReportButton from "@/components/SampleReportButton";
import { createClient, getUser } from "@/lib/supabase/server";
import { SPECIES_EMOJI, ageFromBirthDate, daysUntil, formatDate } from "@/lib/format";
import type { Pet, Vaccination } from "@/lib/types";

export default async function DashboardPage() {
  const user = await getUser();
  const supabase = await createClient();

  const [{ data: pets }, { data: dueVaccines }] = await Promise.all([
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
  ]);

  const extractionEnabled = !!process.env.ANTHROPIC_API_KEY;
  const petList = (pets ?? []) as Pet[];
  const petNameById = new Map(petList.map((p) => [p.id, p.name]));
  const upcoming = ((dueVaccines ?? []) as Vaccination[])
    .filter((v) => v.due_on && daysUntil(v.due_on) <= 60)
    .slice(0, 6);

  return (
    <AppShell email={user?.email}>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="muted mt-1 text-sm">
            {petList.length === 0
              ? "Let's get your first pet on the books."
              : `${petList.length} pet${petList.length === 1 ? "" : "s"} under your care.`}
          </p>
        </div>
        <Link
          href="/pets/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Add pet
        </Link>
      </div>

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

      {petList.length === 0 ? (
        <EmptyState
          title="No pets yet"
          body="Add a pet to start tracking vaccinations, medications, weight and vet visits."
          href="/pets/new"
          cta="Add your first pet"
        />
      ) : (
        <>
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
                  <span className="text-3xl">{SPECIES_EMOJI[pet.species] ?? "🐾"}</span>
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
