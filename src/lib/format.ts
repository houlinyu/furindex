export const SPECIES_LABEL: Record<string, string> = {
  dog: "Dog", cat: "Cat", bird: "Bird", rabbit: "Rabbit",
  reptile: "Reptile", small_mammal: "Small mammal", other: "Other",
};

export const SPECIES_EMOJI: Record<string, string> = {
  dog: "🐕", cat: "🐈", bird: "🦜", rabbit: "🐇",
  reptile: "🦎", small_mammal: "🐹", other: "🐾",
};

/** "3 yr 2 mo" from a birth date, or null if unknown. */
export function ageFromBirthDate(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const born = new Date(birthDate + "T00:00:00");
  const now = new Date();
  if (Number.isNaN(born.getTime()) || born > now) return null;

  let months =
    (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;

  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;
}

/** Whole days until `date`. Negative means overdue. */
export function daysUntil(date: string): number {
  const target = new Date(date + "T00:00:00").getTime();
  const today = new Date(new Date().toDateString()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function formatMoney(cents: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/**
 * For timestamptz columns. `formatDate` above only handles bare date strings —
 * feeding it a timestamp appends "T00:00:00" to an already-complete instant and
 * yields Invalid Date.
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** "8:15 AM" — the day is usually already shown by the group heading. */
export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Local YYYY-MM-DD for an instant — used to group logs by the owner's day. */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
