import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import RecordTabs from "@/components/RecordTabs";
import WeightChart from "@/components/WeightChart";
import CustomFields from "@/components/CustomFields";
import PetDocumentDrop from "@/components/PetDocumentDrop";
import InsuranceSection from "@/components/InsuranceSection";
import DeletePetButton from "@/components/DeletePetButton";
import PetAvatar from "@/components/PetAvatar";
import PetPhotoUpload from "@/components/PetPhotoUpload";
import JournalTimeline from "@/components/JournalTimeline";
import JournalEntryForm from "@/components/JournalEntryForm";
import { signedPetPhotoUrl } from "@/lib/photos";
import { createClient, getUser } from "@/lib/supabase/server";
import { SPECIES_EMOJI, SPECIES_LABEL, ageFromBirthDate, formatDate } from "@/lib/format";
import type {
  CustomValue,
  JournalEntry,
  InsuranceClaim,
  InsurancePolicy,
  PetDocument,
  FieldDefinition,
  Medication,
  Pet,
  Vaccination,
  VetVisit,
  WeightLog,
} from "@/lib/types";

export default async function PetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();

  const { data: pet } = await supabase.from("pets").select("*").eq("id", id).maybeSingle();
  if (!pet) notFound();

  const extractionEnabled = !!process.env.ANTHROPIC_API_KEY;
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
    ]);

  const p = pet as Pet;
  const photoUrl = await signedPetPhotoUrl(supabase, p.photo_url);
  const weightRows = (weights.data ?? []) as WeightLog[];
  const latestWeight = weightRows.at(-1);

  return (
    <AppShell email={user?.email}>
      <Link href="/pets" className="muted text-sm hover:text-brand-600">
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
            href={`/pets/${p.id}/edit`}
            className="muted rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:border-brand-500 hover:text-brand-600"
          >
            Edit
          </Link>
          <DeletePetButton petId={p.id} petName={p.name} />
        </div>
      </header>

      {p.notes && (
        <div className="card muted mb-8 whitespace-pre-wrap p-4 text-sm">{p.notes}</div>
      )}

      {weightRows.length >= 2 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide muted">Weight trend</h2>
          <div className="card p-4">
            <WeightChart points={weightRows.map((w) => ({ date: w.recorded_on, kg: w.weight_kg }))} />
          </div>
        </section>
      )}

      <div className="mb-8">
        <PetPhotoUpload pet={p} photoUrl={photoUrl} />
      </div>

      <PetDocumentDrop
        pet={p}
        documents={(docs.data ?? []) as PetDocument[]}
        extractionEnabled={extractionEnabled}
      />

      <CustomFields
        definitions={(definitions.data ?? []) as FieldDefinition[]}
        values={(customValues.data ?? []) as CustomValue[]}
      />

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
          Journal
        </h2>
        <p className="muted mb-3 text-xs">
          Small observations, dated. A run of them is the history a vet asks for —
          when it started, how often, what it looked like.
        </p>
        <JournalEntryForm petId={p.id} />
        <JournalTimeline entries={(journal.data ?? []) as JournalEntry[]} />
      </section>

      <section className="mb-8">
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

      <RecordTabs
        petId={p.id}
        vaccinations={(vaccinations.data ?? []) as Vaccination[]}
        medications={(medications.data ?? []) as Medication[]}
        weights={[...weightRows].reverse()}
        visits={(visits.data ?? []) as VetVisit[]}
      />
    </AppShell>
  );
}
