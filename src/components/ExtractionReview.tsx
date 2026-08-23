"use client";

import { useState, useTransition } from "react";
import { applyExtraction, type ApplyPlan } from "@/app/document-actions";
import { SPECIES_LABEL, formatDate } from "@/lib/format";
import type { ExtractedReport } from "@/lib/extraction";
import type { Pet, PetSex, PetSpecies } from "@/lib/types";

/**
 * Nothing here is written until the owner ticks it and presses Save. A model
 * misreading a dosage must not reach a medication record unreviewed — so the
 * default for every row is "on", but every row is visible and removable, and
 * low-confidence extractions default to off.
 */
export default function ExtractionReview({
  documentId,
  report,
  pets,
  presetPetId,
}: {
  documentId: string;
  report: ExtractedReport;
  pets: Pet[];
  presetPetId: string | null;
}) {
  const lowConfidence = report.confidence === "low";

  const [petId, setPetId] = useState<string>(presetPetId ?? "");
  const [createNew, setCreateNew] = useState(!presetPetId && pets.length === 0);
  const [vacc, setVacc] = useState<Set<number>>(
    () => new Set(lowConfidence ? [] : report.vaccinations.map((_, i) => i))
  );
  const [meds, setMeds] = useState<Set<number>>(
    () => new Set(lowConfidence ? [] : report.medications.map((_, i) => i))
  );
  const [extras, setExtras] = useState<Set<number>>(
    () => new Set(lowConfidence ? [] : report.additional_fields.map((_, i) => i))
  );
  const [weight, setWeight] = useState(report.weight_kg != null && !lowConfidence);
  const [visit, setVisit] = useState(!lowConfidence);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const petName = report.pet.name ?? "this pet";

  function toggle(set: Set<number>, i: number, update: (s: Set<number>) => void) {
    const next = new Set(set);
    next.has(i) ? next.delete(i) : next.add(i);
    update(next);
  }

  function save() {
    setError(null);
    const plan: ApplyPlan = {
      petId: createNew ? null : petId || null,
      createPet: createNew
        ? {
            name: report.pet.name ?? "Unnamed",
            species: (report.pet.species ?? "other") as PetSpecies,
            breed: report.pet.breed,
            sex: (report.pet.sex ?? "unknown") as PetSex,
            birth_date: report.pet.birth_date,
            microchip_id: report.pet.microchip_id,
          }
        : null,
      vaccinations: [...vacc],
      medications: [...meds],
      additionalFields: [...extras],
      weight,
      visit,
    };
    startTransition(async () => {
      try {
        await applyExtraction(documentId, plan);
      } catch (e) {
        // redirect() throws by design — let it through.
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError(e instanceof Error ? e.message : "Could not save these records");
      }
    });
  }

  if (report.unreadable) {
    return (
      <div className="card p-6 text-center">
        <div className="text-3xl">🤷</div>
        <p className="mt-3 font-medium">This doesn&apos;t look like a vet report</p>
        <p className="muted mx-auto mt-1 max-w-sm text-sm">
          Either it isn&apos;t a veterinary document, or the image is too blurry to read.
          Try a flatter, better-lit photo — or a PDF from the clinic if you have one.
        </p>
      </div>
    );
  }

  const selectedCount =
    vacc.size + meds.size + extras.size + (weight ? 1 : 0) + (visit ? 1 : 0);

  return (
    <div className="space-y-6">
      {lowConfidence && (
        <div className="card border-amber-400 p-4 text-sm">
          <p className="font-medium">⚠️ Hard to read</p>
          <p className="muted mt-1">
            The document was blurry or ambiguous, so nothing is ticked by default.
            Check each line against the original before saving.
          </p>
        </div>
      )}

      {/* ---- Which pet ---- */}
      <section className="card p-4">
        <h2 className="mb-3 text-sm font-medium">Which pet?</h2>
        {pets.length > 0 && (
          <div className="space-y-2">
            {pets.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="pet"
                  checked={!createNew && petId === p.id}
                  onChange={() => {
                    setCreateNew(false);
                    setPetId(p.id);
                  }}
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="pet"
            className="mt-1"
            checked={createNew}
            onChange={() => setCreateNew(true)}
          />
          <span>
            Create a new pet from this report
            <span className="muted mt-0.5 block text-xs">
              {[
                report.pet.name ?? "name not stated",
                report.pet.species ? SPECIES_LABEL[report.pet.species] : null,
                report.pet.breed,
                report.pet.birth_date ? `born ${formatDate(report.pet.birth_date)}` : null,
                report.pet.microchip_id ? `chip ${report.pet.microchip_id}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </label>
      </section>

      {/* ---- Visit ---- */}
      {(report.clinic_name || report.reason || report.diagnosis || report.cost_usd != null) && (
        <Section title="Vet visit">
          <Row checked={visit} onChange={() => setVisit(!visit)}>
            <span className="font-medium">{report.reason || report.diagnosis || "Visit"}</span>
            <span className="muted block text-xs">
              {[
                formatDate(report.visit_date),
                report.clinic_name,
                report.cost_usd != null ? `$${report.cost_usd.toFixed(2)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Row>
        </Section>
      )}

      {report.weight_kg != null && (
        <Section title="Weight">
          <Row checked={weight} onChange={() => setWeight(!weight)}>
            <span className="font-medium">{report.weight_kg} kg</span>
            <span className="muted block text-xs">recorded {formatDate(report.visit_date)}</span>
          </Row>
        </Section>
      )}

      {report.vaccinations.length > 0 && (
        <Section title={`Vaccinations (${report.vaccinations.length})`}>
          {report.vaccinations.map((v, i) => (
            <Row key={i} checked={vacc.has(i)} onChange={() => toggle(vacc, i, setVacc)}>
              <span className="font-medium">{v.name}</span>
              <span className="muted block text-xs">
                {[
                  v.administered_on ? `given ${formatDate(v.administered_on)}` : null,
                  v.due_on ? `due ${formatDate(v.due_on)}` : null,
                  v.lot_number ? `lot ${v.lot_number}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "no dates stated"}
              </span>
            </Row>
          ))}
        </Section>
      )}

      {report.medications.length > 0 && (
        <Section title={`Medications (${report.medications.length})`}>
          {report.medications.map((m, i) => (
            <Row key={i} checked={meds.has(i)} onChange={() => toggle(meds, i, setMeds)}>
              <span className="font-medium">{m.name}</span>
              <span className="muted block text-xs">
                {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "no dosage stated"}
              </span>
            </Row>
          ))}
        </Section>
      )}

      {report.additional_fields.length > 0 && (
        <Section
          title={`Other measurements (${report.additional_fields.length})`}
          hint={`These don't fit the standard records. Accept one and it becomes a field you track from now on — the next report with the same label lines up with it.`}
        >
          {report.additional_fields.map((f, i) => (
            <Row key={i} checked={extras.has(i)} onChange={() => toggle(extras, i, setExtras)}>
              <span className="font-medium">
                {f.label}: {f.value}
                {f.unit ? ` ${f.unit}` : ""}
              </span>
              <span className="muted block text-xs">
                new {f.value_type} field
                {f.recorded_on ? ` · ${formatDate(f.recorded_on)}` : ""}
              </span>
            </Row>
          ))}
        </Section>
      )}

      {report.notes && (
        <Section title="Notes">
          <p className="muted whitespace-pre-wrap px-1 text-sm">{report.notes}</p>
        </Section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending || selectedCount === 0 || (!createNew && !petId)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : `Save ${selectedCount} record${selectedCount === 1 ? "" : "s"}`}
        </button>
        <span className="muted text-xs">
          Nothing is stored on {petName}&apos;s record until you press save.
        </span>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">{title}</h2>
      {hint && <p className="muted mb-2 text-xs">{hint}</p>}
      <div className="card divide-y divide-[var(--border)]">{children}</div>
    </section>
  );
}

function Row({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-1" />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
