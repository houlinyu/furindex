import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import RecordTabs from "@/components/RecordTabs";
import WeightChart from "@/components/WeightChart";
import CustomFields from "@/components/CustomFields";
import PetDocumentDrop from "@/components/PetDocumentDrop";
import HealthSignals from "@/components/HealthSignals";
import ReminderList from "@/components/ReminderList";
import VaccineBlock from "@/components/VaccineBlock";
import OnboardingNudge from "@/components/OnboardingNudge";
import { loadOnboarding } from "@/lib/onboarding-store";
import ReminderForm from "@/components/ReminderForm";
import { todayISO } from "@/lib/reminders";
import ActivityLogger from "@/components/ActivityLogger";
import { activityRungLoggedOn } from "@/lib/activity";
import NutritionSection from "@/components/NutritionSection";
import BreedFacts from "@/components/BreedFacts";
import InsuranceSection from "@/components/InsuranceSection";
import DeletePetButton from "@/components/DeletePetButton";
import PetAvatar from "@/components/PetAvatar";
import PetPhotoUpload from "@/components/PetPhotoUpload";
import PetProgress from "@/components/PetProgress";
import PetProfileCard from "@/components/PetProfileCard";
import JournalTimeline from "@/components/JournalTimeline";
import JournalPatterns from "@/components/JournalPatterns";
import { hasEnoughTimedEntries } from "@/lib/journal-patterns";
import JournalEntryForm from "@/components/JournalEntryForm";
import PetSectionRail, { type RailSection } from "@/components/PetSectionRail";
import { signedPetPhotoUrl } from "@/lib/photos";
import { createClient, getUser } from "@/lib/supabase/server";
import { SPECIES_EMOJI, SPECIES_LABEL, ageFromBirthDate, formatDate } from "@/lib/format";
import { readerKind } from "@/lib/reader";
import type {
  CareReminder,
  CustomValue,
  FeedingLog,
  FeedingPlan,
  FieldDefinition,
  InsuranceClaim,
  InsurancePolicy,
  JournalEntry,
  Medication,
  Pet,
  PetDocument,
  Vaccination,
  VetVisit,
  WeightLog,
} from "@/lib/types";

/**
 * Order matters: it is the order these appear down the page. The rail filters
 * out any whose section didn't render, so a conditional block can stay listed.
 */
const PET_SECTIONS: RailSection[] = [
  { id: "about", label: "About" },
  { id: "weight", label: "Weight trend" },
  { id: "vaccines", label: "Vaccines" },
  { id: "reminders", label: "Reminders" },
  { id: "activity", label: "Activity" },
  { id: "signals", label: "Health signals" },
  { id: "documents", label: "Documents" },
  { id: "fields", label: "Your own fields" },
  { id: "nutrition", label: "Nutrition" },
  { id: "journal", label: "Journal" },
  { id: "insurance", label: "Insurance" },
  { id: "records", label: "All records" },
];

export default async function PetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();

  const reader = readerKind();
  const [
    vaccinations,
    medications,
    weights,
    visits,
    customValues,
    definitions,
    docs,
    policies,
    claims,
    journal,
    plans,
    feedingLogs,
    reminders,
  ] = await Promise.all([
    supabase.from("vaccinations").select("*").eq("pet_id", id).order("administered_on", { ascending: false }),
    supabase.from("medications").select("*").eq("pet_id", id).order("start_date", { ascending: false }),
    supabase.from("weight_logs").select("*").eq("pet_id", id).order("recorded_on", { ascending: true }),
    supabase.from("vet_visits").select("*").eq("pet_id", id).order("visited_on", { ascending: false }),
      supabase
        .from("custom_values")
        .select("*")
        .eq("pet_id", id)
        .order("recorded_on", { ascending: false }),
      supabase.from("field_definitions").select("*").order("label"),
      supabase
        .from("documents")
        .select("*")
        .eq("pet_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("insurance_policies").select("*").eq("pet_id", id).order("created_at"),
      supabase
        .from("insurance_claims")
        .select("*")
        .eq("pet_id", id)
        .order("service_date", { ascending: false }),
      supabase
        .from("journal_entries")
        .select("*")
        .eq("pet_id", id)
        // Several entries can share a day; without the tiebreak their order
        // flips between renders.
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("feeding_plans")
        .select("*")
        .eq("pet_id", id)
        .order("started_on", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("feeding_logs")
        .select("*")
        .eq("pet_id", id)
        .order("fed_at", { ascending: false })
        .limit(50),
      supabase
        .from("care_reminders")
        .select("*")
        .eq("pet_id", id)
        .eq("is_active", true)
        .order("due_on", { ascending: true }),
    ]);

  const p = pet as Pet;
  const journalEntries = (journal.data ?? []) as JournalEntry[];
  // never throws — degrades to "not started" if the table is absent
  const { progress: onboardingProgress } = await loadOnboarding(supabase, id);
  const photoUrl = await signedPetPhotoUrl(supabase, p.photo_url);
  const weightRows = (weights.data ?? []) as WeightLog[];
  const latestWeight = weightRows.at(-1);

  return (
    <AppShell email={user?.email}>
      <Link
        href="/pets"
        className="muted inline-flex min-h-11 items-center text-sm hover:text-[var(--brand-text)]"
      >
        ← Pets
      </Link>

      <header className="mb-8 mt-3 flex flex-wrap items-start gap-4">
        <PetAvatar pet={p} photoUrl={photoUrl} size="lg" />
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <p className="muted mt-1 text-sm">
            {[
              SPECIES_LABEL[p.species],
              p.breed,
              p.sex !== "unknown" ? p.sex : null,
              ageFromBirthDate(p.birth_date),
              latestWeight ? `${latestWeight.weight_kg} kg` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {p.microchip_id && (
            <p className="muted mt-0.5 text-xs">Microchip {p.microchip_id}</p>
          )}
          {p.birth_date && (
            <p className="muted mt-0.5 text-xs">Born {formatDate(p.birth_date)}</p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link
            href={`/pets/${p.id}/dashboard`}
            className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs hover:border-brand-500 hover:text-[var(--brand-text)]"
          >
            Dashboard
          </Link>
          <Link
            href={`/pets/${p.id}/summary`}
            className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs hover:border-brand-500 hover:text-[var(--brand-text)]"
          >
            Summary
          </Link>
          <Link
            href={`/pets/${p.id}/edit`}
            className="muted inline-flex min-h-11 items-center rounded-lg border border-[var(--border)] px-3 text-xs hover:border-brand-500 hover:text-[var(--brand-text)]"
          >
            Edit
          </Link>
          <DeletePetButton petId={p.id} petName={p.name} />
        </div>
      </header>

      {/* Two columns from lg up: the jump rail, then the record. minmax(0,1fr)
          rather than 1fr so a wide child (the weight chart, a table) shrinks
          instead of blowing the grid out and giving the page a sideways
          scrollbar. Below lg the grid collapses and the rail renders its chip
          strip instead. */}
      <div className="lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8">
        <PetSectionRail sections={PET_SECTIONS} />

        <div className="min-w-0">
      {p.notes && (
        <div className="card muted mb-8 whitespace-pre-wrap p-4 text-sm">{p.notes}</div>
      )}

      <PetProgress
        pet={p}
        hasPhoto={!!photoUrl}
        weightCount={weightRows.length}
        recordCount={
          (vaccinations.data?.length ?? 0) +
          (medications.data?.length ?? 0) +
          (visits.data?.length ?? 0)
        }
        observationCount={journalEntries.length + (customValues.data?.length ?? 0)}
        documentCount={docs.data?.length ?? 0}
      />

      <OnboardingNudge pet={p} progress={onboardingProgress} />

      <div id="about" className="scroll-mt-20" />
      <PetProfileCard petId={p.id} petName={p.name} />

      <BreedFacts species={p.species} breed={p.breed} />

      {weightRows.length >= 2 && (
        <section id="weight" className="mb-8 scroll-mt-20">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">Weight trend</h2>
          <div className="card p-4">
            <WeightChart points={weightRows.map((w) => ({ date: w.recorded_on, kg: w.weight_kg }))} />
          </div>
        </section>
      )}

      <div id="vaccines" className="scroll-mt-20" />
      <VaccineBlock
        petId={p.id}
        species={p.species}
        vaccinations={(vaccinations.data ?? []) as Vaccination[]}
        reminders={(reminders.data ?? []) as CareReminder[]}
      />

      <section id="reminders" className="mb-8 scroll-mt-20">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Reminders
        </h2>
        <p className="muted mb-3 text-xs">
          Flea and worm treatments, boosters, check-ups. One tap when it&apos;s done
          and the next one schedules itself.
        </p>
        <div className="mb-4">
          <ReminderForm petId={p.id} />
        </div>
        <ReminderList
          reminders={(reminders.data ?? []) as CareReminder[]}
          today={todayISO()}
          emptyMessage="No reminders yet. The monthly flea &amp; worm preset above is the one most people wish they'd set."
        />
      </section>

      <section id="activity" className="mb-8 scroll-mt-20">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Activity
        </h2>
        <p className="muted mb-3 text-xs">
          One tap a day. The steps are behaviours somebody measured on a collar
          accelerometer, so the number behind them means the same thing every time.
        </p>
        <ActivityLogger
          petId={p.id}
          species={p.species}
          loggedToday={activityRungLoggedOn(
            (customValues.data ?? []) as CustomValue[],
            (definitions.data ?? []) as FieldDefinition[]
          )}
        />
      </section>

      <div id="signals" className="scroll-mt-20" />
      <HealthSignals
        petName={p.name}
        weights={weightRows}
        values={(customValues.data ?? []) as CustomValue[]}
        definitions={(definitions.data ?? []) as FieldDefinition[]}
      />

      <div className="mb-8">
        <PetPhotoUpload pet={p} photoUrl={photoUrl} />
      </div>

      <div id="documents" className="scroll-mt-20" />
      <PetDocumentDrop
        pet={p}
        documents={(docs.data ?? []) as PetDocument[]}
        reader={reader}
      />

      <div id="fields" className="scroll-mt-20" />
      <CustomFields
        definitions={(definitions.data ?? []) as FieldDefinition[]}
        values={(customValues.data ?? []) as CustomValue[]}
      />

      <section id="nutrition" className="mb-8 scroll-mt-20">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Nutrition &amp; feeding
        </h2>
        <p className="muted mb-3 text-xs">
          What they eat, how much, and when it last changed — the context that makes
          a change in appetite mean something.
        </p>
        <NutritionSection
          petId={p.id}
          plans={(plans.data ?? []) as FeedingPlan[]}
          logs={(feedingLogs.data ?? []) as FeedingLog[]}
        />
      </section>

      <section id="journal" className="mb-8 scroll-mt-20">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Journal
        </h2>
        <p className="muted mb-3 text-xs">
          Small observations, dated. A run of them is the history a vet asks for —
          when it started, how often, what it looked like.
        </p>
        <JournalEntryForm petId={p.id} startCollapsed={journalEntries.length === 0} />
        {hasEnoughTimedEntries(journalEntries) && (
          <div className="mb-4">
            <JournalPatterns entries={journalEntries} />
          </div>
        )}
        <JournalTimeline entries={journalEntries} />
      </section>

      <section id="insurance" className="mb-8 scroll-mt-20">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Insurance
        </h2>
        <p className="muted mb-3 text-xs">
          Policy details and claim history, so a claim doesn&apos;t stall on paperwork
          you can&apos;t find.
        </p>
        <InsuranceSection
          petId={p.id}
          policies={(policies.data ?? []) as InsurancePolicy[]}
          claims={(claims.data ?? []) as InsuranceClaim[]}
        />
      </section>

      <div id="records" className="scroll-mt-20" />
      <RecordTabs
        petId={p.id}
        vaccinations={(vaccinations.data ?? []) as Vaccination[]}
        medications={(medications.data ?? []) as Medication[]}
        weights={[...weightRows].reverse()}
        visits={(visits.data ?? []) as VetVisit[]}
      />
        </div>
      </div>
    </AppShell>
  );
}
