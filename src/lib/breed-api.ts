/**
 * Breed reference data from TheCatAPI / TheDogAPI (both run by "That API Company").
 *
 * SERVER ONLY. The API key is a secret: it is read from a non-`NEXT_PUBLIC_`
 * env var, so importing this from a client component would silently give you
 * `undefined` rather than leaking — but never do it anyway.
 *
 * Design constraints that shaped this file:
 *
 * 1. The deployment currently has NO third-party keys set. Both APIs declare
 *    `security: [{ "x-api-key": [] }]` on GET /breeds in their OpenAPI specs, so
 *    we must assume a key is needed. Every entry point therefore returns `null`
 *    when the key is missing — the feature disappears, nothing throws.
 * 2. Breed data is effectively static (a new breed is recognised maybe once a
 *    year), so we cache the whole list for 30 days via Next's fetch cache and do
 *    the matching locally. Matching locally is not just a cache win: detecting an
 *    AMBIGUOUS match needs to see every candidate, which /breeds/search can't
 *    tell us.
 * 3. A third-party outage must never take down a pet's page. Every call has a
 *    timeout and returns `null` instead of throwing.
 */

const CAT_BASE = "https://api.thecatapi.com/v1";
const DOG_BASE = "https://api.thedogapi.com/v1";

/** Breed lists change on a scale of years; 30 days is still conservative. */
const REVALIDATE_SECONDS = 60 * 60 * 24 * 30;

/** Long enough for a cold upstream, short enough not to stall a page render. */
const TIMEOUT_MS = 5_000;

/** The APIs cap page size; ~172 dog breeds means we may need several pages. */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export type BreedSpecies = "cat" | "dog";

/** Normalised, render-ready shape. Every field may be absent — the two APIs
 *  populate different subsets, and the free tier populates fewer still. */
export type BreedFacts = {
  species: BreedSpecies;
  /** The API's canonical breed name, not the user's typed text. */
  name: string;
  description: string | null;
  temperament: string[];
  origin: string | null;
  /** Human-readable, always carrying its unit, e.g. "12 - 15 years". */
  lifeSpan: string | null;
  /** Metric, e.g. "3 - 6 kg". */
  weight: string | null;
  /** Breed-specific health note, only when the API actually gives us grounds. */
  healthNotes: string | null;
  didYouKnow: string | null;
  wikipediaUrl: string | null;
};

/**
 * Union of the cat and dog breed shapes across free + paid tiers.
 * Everything is optional because the free ("Basic") tier omits a lot: notably
 * dog breeds have NO `description` on the free tier, only `bred_for` /
 * `breed_group`, which is why `buildDescription` composes a fallback.
 */
type RawBreed = {
  id?: number | string;
  name?: string;
  alt_names?: string;
  description?: string;
  temperament?: string;
  origin?: string;
  life_span?: string;
  bred_for?: string;
  breed_group?: string;
  wikipedia_url?: string;
  /** Cat-only, 1-5. Higher means more prone to inherited health problems. */
  health_issues?: number;
  hypoallergenic?: number | boolean;
  hairless?: number | boolean;
  rare?: number | boolean;
  natural?: number | boolean;
  weight?: { imperial?: string; metric?: string };
  height?: { imperial?: string; metric?: string };
};

// ---------------------------------------------------------------- transport --

function apiKeyFor(species: BreedSpecies): string | null {
  // One key from thatapicompany works on both hosts, so allow a shared var as a
  // fallback rather than forcing the same secret to be set twice.
  const specific = species === "cat" ? process.env.CAT_API_KEY : process.env.DOG_API_KEY;
  return specific || process.env.PET_BREED_API_KEY || null;
}

/** True when the feature can work at all. Cheap enough to call from a render. */
export function breedApiConfigured(species: string): boolean {
  const s = toBreedSpecies(species);
  return s !== null && apiKeyFor(s) !== null;
}

/**
 * Fetch every breed for a species. Returns `null` on ANY failure — missing key,
 * timeout, non-2xx, malformed JSON. Callers treat `null` as "no facts today".
 */
async function fetchBreedList(species: BreedSpecies): Promise<RawBreed[] | null> {
  // Defensive: this module must never run in a browser, where the key is absent
  // and the request would just burn a rate-limit slot as an anonymous call.
  if (typeof window !== "undefined") return null;

  const key = apiKeyFor(species);
  if (!key) return null;

  const base = species === "cat" ? CAT_BASE : DOG_BASE;
  const all: RawBreed[] = [];

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetch(`${base}/breeds?limit=${PAGE_SIZE}&page=${page}`, {
        headers: { "x-api-key": key },
        // Opts this request into the full-route/data cache for 30 days. Without
        // it Next 15 would refetch on every render.
        next: { revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;

      const batch: unknown = await res.json();
      if (!Array.isArray(batch)) return null;
      all.push(...(batch as RawBreed[]));

      // A short page means we've reached the end.
      if (batch.length < PAGE_SIZE) break;
    }
  } catch {
    // Timeout, DNS, TLS, malformed JSON — all the same to the caller.
    return null;
  }

  return all.length ? all : null;
}

// ----------------------------------------------------------------- matching --

export function toBreedSpecies(species: string): BreedSpecies | null {
  const s = species.trim().toLowerCase();
  return s === "cat" || s === "dog" ? s : null;
}

/** Lowercase, strip accents and punctuation, collapse whitespace. */
function normalise(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Free text that describes a mix, an unknown, or a generic non-breed
 * ("domestic shorthair" is a coat description, not a breed).
 *
 * This is the single most important guard in the file. Without it "Half corgi,
 * half mystery" word-matches "corgi" and we would confidently print Pembroke
 * Welsh Corgi facts for a dog that is mostly something else. Showing nothing is
 * the correct answer for every string here.
 */
const NON_BREED_MARKERS = [
  "mix", "mixed", "cross", "crossbreed", "half", "part", "mystery",
  "unknown", "unsure", "not sure", "rescue", "mutt", "moggy", "moggie",
  "domestic shorthair", "domestic longhair", "domestic mediumhair",
  "dsh", "dlh", "tabby", "calico", "tortoiseshell", "tuxedo",
];

/**
 * Common shorthand that is unambiguous in practice. Deliberately small: an
 * alias here is an assertion that no reasonable person means anything else.
 * "Corgi" is NOT here — Pembroke and Cardigan are different breeds.
 */
const ALIASES: Record<string, string> = {
  shiba: "shiba inu",
  akita: "akita",
  lab: "labrador retriever",
  labrador: "labrador retriever",
  golden: "golden retriever",
  "german shepherd": "german shepherd dog",
  alsatian: "german shepherd dog",
  frenchie: "french bulldog",
  "yorkie": "yorkshire terrier",
  dachshund: "dachshund",
  weiner: "dachshund",
  sausage: "dachshund",
  "great pyrenees": "great pyrenees",
  staffie: "staffordshire bull terrier",
  "pit bull": "american pit bull terrier",
  pitbull: "american pit bull terrier",
  westie: "west highland white terrier",
  "maine coon": "maine coon",
  siamese: "siamese",
  ragdoll: "ragdoll",
  sphinx: "sphynx",
  "russian blue": "russian blue",
};

/** Whole-word containment: "shiba" matches "shiba inu", "iba" matches nothing. */
function containsWord(haystack: string, needle: string): boolean {
  return new RegExp(`(^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($| )`).test(haystack);
}

/**
 * Resolve free text to exactly one breed, or `null`.
 *
 * The rule throughout: when in doubt, refuse. A wrong breed's facts are worse
 * than no facts, so an ambiguous match (more than one candidate) returns null
 * rather than picking a favourite. "domestic shorthair" would otherwise match
 * American / British / Exotic Shorthair equally well.
 */
function matchBreed(breeds: RawBreed[], typed: string): RawBreed | null {
  const q = normalise(typed);

  // Too short to be meaningful — "a" or "ox" would match half the list.
  if (q.length < 3) return null;

  // Any hint of a mix or a generic coat description: refuse outright.
  if (NON_BREED_MARKERS.some((m) => containsWord(q, m))) return null;

  const named = breeds.filter((b) => b.name);
  const key = (b: RawBreed) => normalise(b.name ?? "");

  // 1. Exact name match.
  const exact = named.find((b) => key(b) === q);
  if (exact) return exact;

  // 2. Exact match on a documented alternative name ("alt_names" is comma-separated).
  const byAlt = named.find((b) =>
    (b.alt_names ?? "")
      .split(",")
      .map((n) => normalise(n))
      .filter(Boolean)
      .includes(q)
  );
  if (byAlt) return byAlt;

  // 3. Curated alias, then re-resolve exactly.
  const alias = ALIASES[q];
  if (alias) {
    const viaAlias = named.find((b) => key(b) === alias);
    if (viaAlias) return viaAlias;
  }

  // 4. Drop a parenthetical qualifier: "Poodle (Toy)" -> "poodle".
  const base = q.replace(/\s*\(.*$/, "").trim();

  // 5. Whole-word containment in either direction, but ONLY if unique.
  const candidates = named.filter(
    (b) => containsWord(key(b), base) || containsWord(base, key(b))
  );
  if (candidates.length === 1) return candidates[0];

  // Zero candidates, or several — either way we do not guess.
  return null;
}

// --------------------------------------------------------------- normalising --

function splitTemperament(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6); // Some breeds list a dozen; six is all a compact card can show.
}

/** The APIs are inconsistent: dogs say "10 - 12 years", cats just "14 - 15". */
function formatLifeSpan(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return /year/i.test(v) ? v : `${v} years`;
}

function formatWeight(raw: RawBreed["weight"]): string | null {
  const metric = raw?.metric?.trim();
  if (!metric) return null;
  return `${metric} kg`;
}

/**
 * Free-tier dog breeds have no `description` at all, so compose one from what
 * we do get rather than showing an empty card.
 */
function buildDescription(b: RawBreed): string | null {
  const described = b.description?.trim();
  if (described) return described;

  const bredFor = b.bred_for?.trim();
  const group = b.breed_group?.trim();
  if (bredFor && group) return `A ${group.toLowerCase()} breed, originally bred for ${bredFor.toLowerCase()}.`;
  if (bredFor) return `Originally bred for ${bredFor.toLowerCase()}.`;
  if (group) return `A member of the ${group.toLowerCase()} group.`;
  return null;
}

const truthy = (v: number | boolean | undefined): boolean => v === 1 || v === true;

/**
 * Only assert a health note when the API gives us a basis for it. We never
 * invent one, and we never phrase it as advice — this is a health app, and a
 * generic line about a breed is not a statement about this animal.
 */
function buildHealthNotes(b: RawBreed): string | null {
  const parts: string[] = [];

  if (typeof b.health_issues === "number" && b.health_issues >= 4) {
    parts.push("More prone than average to inherited health problems");
  } else if (typeof b.health_issues === "number" && b.health_issues <= 2) {
    parts.push("Generally robust, with few breed-linked health problems");
  }
  if (truthy(b.hypoallergenic)) parts.push("often tolerated by people with mild allergies");
  if (truthy(b.hairless)) parts.push("hairless, so needs protection from sun and cold");

  if (!parts.length) return null;
  return `${parts.join("; ")}. Worth raising with your vet rather than acting on alone.`;
}

/** Small stable hash, so the chosen fact doesn't flicker between renders/servers. */
function stableIndex(seed: string, length: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % length;
}

function buildDidYouKnow(b: RawBreed, species: BreedSpecies): string | null {
  const name = b.name ?? "This breed";
  const options: string[] = [];

  const origin = b.origin?.trim();
  if (origin) options.push(`${name} traces back to ${origin}.`);

  const bredFor = b.bred_for?.trim();
  if (bredFor) options.push(`${name} was originally bred for ${bredFor.toLowerCase()}.`);

  const group = b.breed_group?.trim();
  if (group && species === "dog") options.push(`${name} belongs to the ${group.toLowerCase()} group.`);

  if (truthy(b.natural)) options.push(`${name} is a natural breed — it arose without deliberate crossing.`);
  if (truthy(b.rare)) options.push(`${name} is considered a rare breed.`);
  if (truthy(b.hairless)) options.push(`${name} is a hairless breed.`);

  const alt = b.alt_names?.split(",")[0]?.trim();
  if (alt) options.push(`${name} is also known as the ${alt}.`);

  if (!options.length) return null;
  return options[stableIndex(name, options.length)];
}

function normaliseBreed(b: RawBreed, species: BreedSpecies): BreedFacts | null {
  if (!b.name) return null;
  return {
    species,
    name: b.name,
    description: buildDescription(b),
    temperament: splitTemperament(b.temperament),
    origin: b.origin?.trim() || null,
    lifeSpan: formatLifeSpan(b.life_span),
    weight: formatWeight(b.weight),
    healthNotes: buildHealthNotes(b),
    didYouKnow: buildDidYouKnow(b, species),
    wikipediaUrl: b.wikipedia_url?.trim() || null,
  };
}

// ------------------------------------------------------------------- public --

/**
 * The one entry point. Returns `null` for: an unsupported species, a missing
 * API key, an upstream failure, or a breed string we cannot match confidently.
 * The caller cannot distinguish these, and shouldn't — all four mean "render
 * nothing".
 */
export async function getBreedFacts(
  species: string,
  breed: string | null | undefined
): Promise<BreedFacts | null> {
  const s = toBreedSpecies(species);
  if (!s || !breed?.trim()) return null;

  const list = await fetchBreedList(s);
  if (!list) return null;

  const match = matchBreed(list, breed);
  if (!match) return null;

  return normaliseBreed(match, s);
}

/**
 * TheDogAPI/TheCatAPI Terms of Service §3.3.a require that users be made aware
 * the app uses the API. We render it unconditionally — the waiver only applies
 * to paid accounts, and being quietly out of compliance is not worth the pixels
 * saved.
 * https://www.thedogapi.com/terms
 */
export const BREED_API_ATTRIBUTION: Record<BreedSpecies, { label: string; url: string }> = {
  cat: { label: "TheCatAPI", url: "https://thecatapi.com" },
  dog: { label: "TheDogAPI", url: "https://thedogapi.com" },
};
