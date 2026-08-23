import { formatDate } from "@/lib/format";
import type { CustomValue, FieldDefinition } from "@/lib/types";

/**
 * Renders the owner's own field definitions and every value recorded against
 * this pet, newest first, grouped by field. This is the read side of what the
 * review screen accepts — without it, accepting a measurement stores it invisibly.
 */
export default function CustomFields({
  definitions,
  values,
}: {
  definitions: FieldDefinition[];
  values: CustomValue[];
}) {
  if (values.length === 0) return null;

  const defById = new Map(definitions.map((d) => [d.id, d]));
  const byDefinition = new Map<string, CustomValue[]>();
  for (const v of values) {
    const list = byDefinition.get(v.definition_id) ?? [];
    list.push(v);
    byDefinition.set(v.definition_id, list);
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wide muted">
        Your own fields
      </h2>
      <p className="muted mb-3 text-xs">
        Built from what your reports contained — not from questions we picked.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {[...byDefinition.entries()].map(([defId, rows]) => {
          const def = defById.get(defId);
          if (!def) return null;
          const latest = rows[0];

          return (
            <div key={defId} className="card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">{def.label}</p>
                {rows.length > 1 && (
                  <span className="muted shrink-0 text-xs">{rows.length} readings</span>
                )}
              </div>

              <p className="mt-1 text-lg font-semibold text-brand-600">
                {renderValue(latest, def)}
              </p>
              <p className="muted text-xs">{formatDate(latest.recorded_on)}</p>

              {rows.length > 1 && (
                <ul className="mt-3 space-y-1 border-t border-[var(--border)] pt-2">
                  {rows.slice(1, 5).map((v) => (
                    <li key={v.id} className="muted flex justify-between text-xs">
                      <span>{formatDate(v.recorded_on)}</span>
                      <span>{renderValue(v, def)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function renderValue(v: CustomValue, def: FieldDefinition): string {
  const unit = def.unit ? ` ${def.unit}` : "";
  if (v.value_number != null) return `${v.value_number}${unit}`;
  if (v.value_bool != null) return v.value_bool ? "Yes" : "No";
  if (v.value_date != null) return formatDate(v.value_date);
  return `${v.value_text ?? "—"}${unit}`;
}
