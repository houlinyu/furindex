import Link from "next/link";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import RecordTabs from "@/components/RecordTabs";
import WeightChart from "@/components/WeightChart";
import CustomFields from "@/components/CustomFields";
import PetDocumentDrop from "@/components/PetDocumentDrop";
import DeletePetButton from "@/components/DeletePetButton";
import { createClient, getUser } from "@/lib/supabase/server";
import { SPECIES_EMOJI, SPECIES_LABEL, ageFromBirthDate, formatDate } from "@/lib/format";
import type {
  CustomValue,
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
  const [vaccinations, medications, weights, visits, customValues, definitions, docs] =
    await Promise.all([
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
    ]);

  const p = pet as Pet;
  const weightRows = (weights.data ?? []) as WeightLog[];
  const latestWeight = weightRows.at(-1);

  return (
    <AppShell email={user?.email}>
      <Link href="/pets" className="muted text-sm hover:text-brand-600">
        ← Pets
      </Link>

      <header className="mb-8 mt-3 flex flex-wrap items-start gap-4">
        <span className="text-5xl">{SPECIES_EMOJI[p.species] ?? "🐾"}</span>
        <div className="min-w-0 flex-1">
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
        <DeletePetButton petId={p.id} petName={p.name} />
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

      <PetDocumentDrop
        pet={p}
        documents={(docs.data ?? []) as PetDocument[]}
        extractionEnabled={extractionEnabled}
      />

      <CustomFields
        definitions={(definitions.data ?? []) as FieldDefinition[]}
        values={(customValues.data ?? []) as CustomValue[]}
      />

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
