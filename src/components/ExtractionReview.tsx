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
  // High confidence is only ever reached by a PDF's own text layer, so its
  // values are exact. Anything below that was read approximately (OCR, or an
  // ambiguity the parser could not settle) and the numbers want a second look.
  // This changes only what the screen SAYS — never what it pre-ticks.
  const exact = report.confidence === "high";
  // Anything not read from a PDF's own text layer was read approximately. A
  // photographed digit can be misread to a DIFFERENT but equally-plausible digit
  // — a wrong-but-valid microchip, a decimal-dropped weight, a year-flipped date
  // — and OCR confidence does NOT separate those from correct reads (a wrong
  // value can come back at 90%+). So flag the identifier / number / date fields
  // themselves, by field type, telling the reviewer exactly what to eyeball
  // against the original. Nothing here changes what is pre-ticked.
  const needsCheck = !exact;

  // With exactly one pet there is nothing to disambiguate, and leaving it
  // unpicked disables the save button under a label that already counts the
  // records ready to go — a dead button with no visible reason. With two or
  // more, no default: filing a report against the wrong animal is worse than
  // one extra click.
  const [petId, setPetId] = useState<string>(
    presetPetId ?? (pets.length === 1 ? pets[0].id : "")
  );
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
      {exact && (
        <div className="card border-emerald-400 p-4 text-sm">
          <p className="font-medium">✓ Read from the document&apos;s exact text</p>
          <p className="muted mt-1">
            These values came from the PDF&apos;s own text layer, so they match the
            document exactly. Everything is ticked — untick anything you&apos;d rather not save.
          </p>
        </div>
      )}

      {report.confidence === "medium" && (
        <div className="card border-amber-400 p-4 text-sm">
          <p className="font-medium">Double-check the figures</p>
          <p className="muted mt-1">
            Some of this was read approximately. Records are ticked, but please check
            dates, doses and lot numbers against the original before saving.
          </p>
        </div>
      )}

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
              {needsCheck && report.pet.microchip_id && <Verify />}
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
              {needsCheck && <Verify />}
            </span>
          </Row>
        </Section>
      )}

      {report.weight_kg != null && (
        <Section title="Weight">
          <Row checked={weight} onChange={() => setWeight(!weight)}>
            <span className="font-medium">
              {report.weight_kg} kg{needsCheck && <Verify />}
            </span>
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
                {needsCheck && (v.administered_on || v.due_on) && <Verify />}
              </span>
            </Row>
          ))}
        </Section>
      )}

      {report.medications.length > 0 && (
        <Section
          title={`Medications (${report.medications.length})`}
          hint={exact ? undefined : "Doses read from a photo can be off by a digit — confirm each against the original."}
        >
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

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending || selectedCount === 0 || (!createNew && !petId)}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : `Save ${selectedCount} record${selectedCount === 1 ? "" : "s"}`}
        </button>
        <span className="muted text-xs">
          {!createNew && !petId
            ? "Choose which pet this report belongs to first."
            : selectedCount === 0
              ? "Tick at least one record to save."
              : `Nothing is stored on ${petName}'s record until you press save.`}
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

/**
 * A per-field "read approximately, verify it" marker. Shown on the fields where a
 * length-preserving OCR misread is both likely and invisible to the eye — a
 * microchip, a weight, a date — because those are the values a reviewer would
 * otherwise trust without checking.
 */
function Verify() {
  return (
    <span
      className="ml-1 inline-block rounded bg-amber-100 px-1 text-[10px] font-medium leading-4 text-amber-800 align-middle dark:bg-amber-900/40 dark:text-amber-300"
      title="Read approximately from an image — check this value against the original before saving."
    >
      check ✓
    </span>
  );
}
