/**
 * Vaccine name recognition for the local extractor.
 *
 * Clinics print the same vaccine a dozen ways — DHPP, DA2PP, DAPP, "Distemper
 * combo" — and OCR then chews the result ("FuRep" for FVRCP is a real reading
 * from the test fixtures). Canonicalising the NAME is safe and is the point of
 * this table. Nothing else about the row is ever corrected.
 */

export interface VaccineDef {
  canonical: string;
  species: "dog" | "cat" | "either";
  aliases: string[];
}

export const VACCINES: VaccineDef[] = [
  {
    canonical: "Rabies",
    species: "either",
    aliases: [
      "rabies", "imrab", "rv 1 year", "rabies 1 year", "rabies 3 year",
      "rabvac", "defensor", "nobivac rabies", "purevax rabies", "rabisin",
    ],
  },
  {
    canonical: "DHPP",
    species: "dog",
    aliases: [
      "dhpp", "dhppv", "dhppi", "da2pp", "da2ppv", "da2ppl", "dapp", "dappv",
      "dhlpp", "dhlppv", "dap", "da2p", "dhp",
      "distemper parvo", "distemper adenovirus parainfluenza parvovirus",
      "canine distemper combo", "5 in 1", "5-in-1", "4 in 1", "4-in-1",
      "dhpp booster",
      // Individual core-canine components — a card may list them on one line each;
      // they all belong to the same combination shot, so they fold into DHPP.
      "distemper", "canine distemper", "parvo", "parvovirus", "canine parvovirus",
      "adenovirus", "adenovirus type 2", "parainfluenza",
      // Common brand names for the canine combination vaccine.
      "nobivac dhppi", "nobivac dhp", "vanguard", "vanguard plus", "duramune",
      "recombitek c", "recombitek c4", "spectra", "canigen",
    ],
  },
  {
    canonical: "FVRCP",
    species: "cat",
    aliases: [
      "fvrcp", "fvrcpc", "frcp", "fvr cp", "feline rcp", "rcp", "hcp",
      "feline distemper", "feline viral rhinotracheitis calicivirus panleukopenia",
      "3 in 1 feline", "3 in 1", "fvacp",
      // Individual feline-core components fold into the same combination shot.
      "panleukopenia", "feline panleukopenia", "calicivirus", "feline calicivirus",
      "rhinotracheitis", "feline rhinotracheitis",
      // Brand names for the feline combination vaccine.
      "felocell", "fel o vax", "felovax", "nobivac feline", "purevax rcp",
      "tricat", "tricat trio", "eurifel",
    ],
  },
  {
    canonical: "Bordetella",
    species: "dog",
    aliases: [
      "bordetella", "bordetella bronchiseptica",
      "kennel cough", "bronchi shield", "bronchicine", "intratrac",
    ],
  },
  {
    canonical: "Leptospirosis",
    species: "dog",
    aliases: [
      "leptospirosis", "lepto", "lepto 4", "lepto4", "l4", "l2", "leptospira",
      "nobivac lepto",
    ],
  },
  {
    canonical: "Canine coronavirus",
    species: "dog",
    aliases: ["canine coronavirus", "coronavirus", "ccv", "canine corona"],
  },
  {
    canonical: "FeLV",
    species: "cat",
    // NOT bare "leukemia virus": that phrase appears on HUMAN leukemia charts and
    // would fabricate a feline vaccine from a person's record. Require "feline".
    aliases: ["felv", "fel v", "feline leukemia", "feline leukaemia", "feline leukemia virus", "purevax felv"],
  },
  {
    canonical: "Lyme",
    species: "dog",
    aliases: ["lyme", "borrelia", "lyme disease", "borrelia burgdorferi"],
  },
  {
    canonical: "Canine influenza",
    species: "dog",
    // NOT bare "flu vaccine": a HUMAN "Influenza (flu) vaccine" line would map to
    // canine influenza. Require the canine qualifier.
    aliases: ["canine influenza", "civ", "h3n2", "h3n8", "canine flu", "dog flu"],
  },
  {
    canonical: "Rattlesnake",
    species: "dog",
    aliases: ["rattlesnake", "crotalus atrox", "rattlesnake toxoid"],
  },
  {
    canonical: "Giardia",
    species: "either",
    aliases: ["giardia", "giardia vax"],
  },
  {
    canonical: "FIP",
    species: "cat",
    aliases: ["fip", "feline infectious peritonitis"],
  },
  {
    canonical: "FIV",
    species: "cat",
    aliases: ["fiv", "feline immunodeficiency", "feline immunodeficiency virus", "feline aids"],
  },
];

export interface VaccineMatch {
  canonical: string;
  /** The text that actually matched, as printed. */
  matchedText: string;
  /** True when the match needed edit-distance tolerance, i.e. OCR damage. */
  fuzzy: boolean;
  species: "dog" | "cat" | "either";
}

/** Uppercase, letters and digits only — the shape aliases are compared in. */
function squash(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

const ALIAS_INDEX: Array<{ alias: string; def: VaccineDef }> = VACCINES.flatMap((def) =>
  def.aliases.map((alias) => ({ alias: squash(alias), def }))
).sort((a, b) => b.alias.length - a.alias.length); // longest alias wins

/**
 * Find a vaccine named in `line`.
 *
 * `allowFuzzy` should be on only for OCR text. It permits one edit for aliases
 * of 4+ characters, and two edits for 5+ character aliases when the first
 * character still matches — enough for FuRep→FVRCP, tight enough that ordinary
 * words do not become vaccines.
 */
export function findVaccineInLine(line: string, allowFuzzy = false): VaccineMatch | null {
  const squashed = squash(line);
  if (!squashed) return null;

  for (const { alias, def } of ALIAS_INDEX) {
    const re = new RegExp(`(?<![A-Z0-9])${alias.replace(/ /g, "\\s+")}(?![A-Z0-9])`);
    const m = re.exec(squashed);
    if (m) {
      return { canonical: def.canonical, matchedText: m[0], fuzzy: false, species: def.species };
    }
  }
  if (!allowFuzzy) return null;

  // Fuzzy matching only inside a line that is plainly about a vaccination —
  // a date, a lot number or a giving/due word. Without that guard "Rabbit
  // hutch" is two edits from "Rabies" and becomes a rabies shot.
  const vaccinationContext =
    /\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}/.test(line) ||
    /\b(lot|batch|serial|given|administered|due|booster|vaccin|immuni[sz])/i.test(line);
  if (!vaccinationContext) return null;

  // Word-by-word, nearest alias wins. Multi-word aliases are skipped here:
  // fuzzy-matching a phrase invites false positives.
  const words = squashed.split(/\s+/).filter((w) => w.length >= 4);
  let best: { d: number; def: VaccineDef; word: string; alias: string } | null = null;
  for (const word of words) {
    for (const { alias, def } of ALIAS_INDEX) {
      if (alias.includes(" ") || alias.length < 4) continue;
      const d = editDistance(word, alias);
      const limit = alias.length >= 5 && word[0] === alias[0] ? 2 : 1;
      if (d <= limit && (!best || d < best.d)) best = { d, def, word, alias };
    }
  }
  if (!best) return null;
  return { canonical: best.def.canonical, matchedText: best.word, fuzzy: true, species: best.def.species };
}
