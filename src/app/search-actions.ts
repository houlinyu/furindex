"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchHit = {
  kind: "pet" | "vaccination" | "medication" | "visit" | "journal" | "document" | "field";
  petId: string;
  petName: string;
  title: string;
  subtitle: string;
  date: string | null;
  href: string;
};

/**
 * Cross-record search. Every query below runs under the caller's session, so RLS
 * scopes results to their own pets — there is no owner filter in application
 * code and there deliberately isn't one, because the database is the place that
 * check belongs.
 */
export async function searchRecords(raw: string): Promise<SearchHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Escape PostgREST's pattern metacharacters so a user typing % or _ doesn't
  // silently turn their query into a wildcard.
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  const { data: pets } = await supabase.from("pets").select("id, name, species, breed, notes, microchip_id");
  const petList = pets ?? [];
  if (petList.length === 0) return [];
  const nameOf = new Map(petList.map((p) => [p.id, p.name]));

  const [vacc, meds, visits, journal, docs, values, defs] = await Promise.all([
    supabase.from("vaccinations").select("id, pet_id, name, administered_on, due_on, vet_clinic").ilike("name", like),
    supabase.from("medications").select("id, pet_id, name, dosage, frequency, start_date").ilike("name", like),
    supabase.from("vet_visits").select("id, pet_id, reason, diagnosis, clinic, visited_on, notes").or(
      `reason.ilike.${like},diagnosis.ilike.${like},clinic.ilike.${like}`
    ),
    supabase.from("journal_entries").select("id, pet_id, title, body, category, occurred_on").or(
      `title.ilike.${like},body.ilike.${like}`
    ),
    supabase.from("documents").select("id, pet_id, filename, status, created_at").ilike("filename", like),
    supabase.from("custom_values").select("id, pet_id, definition_id, value_text, value_number, recorded_on"),
    supabase.from("field_definitions").select("id, label, unit").ilike("label", like),
  ]);

  const hits: SearchHit[] = [];
  const lower = q.toLowerCase();

  for (const p of petList) {
    const hay = [p.name, p.breed, p.notes, p.microchip_id].filter(Boolean).join(" ").toLowerCase();
    if (hay.includes(lower)) {
      hits.push({
        kind: "pet", petId: p.id, petName: p.name,
        title: p.name,
        subtitle: [p.breed, p.microchip_id && `chip ${p.microchip_id}`].filter(Boolean).join(" · ") || "Pet",
        date: null, href: `/pets/${p.id}`,
      });
    }
  }
  for (const v of vacc.data ?? [])
    hits.push({ kind: "vaccination", petId: v.pet_id, petName: nameOf.get(v.pet_id) ?? "", title: v.name,
      subtitle: v.vet_clinic ?? "Vaccination", date: v.administered_on, href: `/pets/${v.pet_id}` });
  for (const m of meds.data ?? [])
    hits.push({ kind: "medication", petId: m.pet_id, petName: nameOf.get(m.pet_id) ?? "", title: m.name,
      subtitle: [m.dosage, m.frequency].filter(Boolean).join(" · ") || "Medication", date: m.start_date, href: `/pets/${m.pet_id}` });
  for (const v of visits.data ?? [])
    hits.push({ kind: "visit", petId: v.pet_id, petName: nameOf.get(v.pet_id) ?? "", title: v.reason || v.diagnosis || "Vet visit",
      subtitle: v.clinic ?? "Vet visit", date: v.visited_on, href: `/pets/${v.pet_id}` });
  for (const j of journal.data ?? [])
    hits.push({ kind: "journal", petId: j.pet_id, petName: nameOf.get(j.pet_id) ?? "", title: j.title,
      subtitle: j.category ?? "Journal", date: j.occurred_on, href: `/pets/${j.pet_id}` });
  for (const d of docs.data ?? [])
    hits.push({ kind: "document", petId: d.pet_id ?? "", petName: d.pet_id ? nameOf.get(d.pet_id) ?? "" : "Unfiled",
      title: d.filename, subtitle: d.status, date: d.created_at?.slice(0, 10) ?? null, href: `/documents/${d.id}` });

  // Custom values are matched by their definition's label, which is why the two
  // are fetched separately — the value row itself has no searchable text.
  const defById = new Map((defs.data ?? []).map((d) => [d.id, d]));
  for (const v of values.data ?? []) {
    const def = defById.get(v.definition_id);
    if (!def) continue;
    hits.push({ kind: "field", petId: v.pet_id, petName: nameOf.get(v.pet_id) ?? "", title: def.label,
      subtitle: `${v.value_number ?? v.value_text ?? ""}${def.unit ? ` ${def.unit}` : ""}`,
      date: v.recorded_on, href: `/pets/${v.pet_id}` });
  }

  return hits
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 40);
}
