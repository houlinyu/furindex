import Link from "next/link";
import ReportUpload from "@/components/ReportUpload";
import SampleReportButton from "@/components/SampleReportButton";
import { formatDate } from "@/lib/format";
import type { Pet, PetDocument } from "@/lib/types";

/**
 * Drop zone on the pet page. Anything dropped here is filed against this pet
 * automatically — no picker, no "which animal is this?" step.
 */
export default function PetDocumentDrop({
  pet,
  documents,
  extractionEnabled,
}: {
  pet: Pet;
  documents: PetDocument[];
  extractionEnabled: boolean;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
        Add a document
      </h2>
      <p className="muted mb-3 text-xs">
        Drop a vet report, invoice, lab result or vaccination card — PDF or a photo.
        We read it and propose records for {pet.name}; nothing is saved until you
        confirm each line.
      </p>

      {extractionEnabled ? (
        <ReportUpload pets={[]} fixedPetId={pet.id} compact />
      ) : (
        <div className="card p-4 text-center">
          <div className="text-2xl">📄</div>
          <p className="mt-2 text-sm font-medium">Automatic reading is switched off</p>
          <p className="muted mx-auto mt-1 max-w-md text-xs leading-relaxed">
            No Anthropic API key is configured on this deployment, so uploads can&apos;t
            be read yet. Open a sample to see exactly what the feature does — it runs
            the identical review-and-confirm flow.
          </p>
          <div className="mt-3">
            <SampleReportButton primary />
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <ul className="card mt-3 divide-y divide-[var(--border)]">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="shrink-0">
                {d.status === "applied" ? "✅" : d.status === "failed" ? "⚠️" : "📄"}
              </span>
              <span className="min-w-0 flex-1 truncate">{d.filename}</span>
              <span className="muted shrink-0 text-xs">{formatDate(d.created_at.slice(0, 10))}</span>
              <Link
                href={`/documents/${d.id}`}
                className="muted shrink-0 text-xs underline underline-offset-4 hover:text-brand-600"
              >
                {d.status === "applied" ? "view" : "review"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
