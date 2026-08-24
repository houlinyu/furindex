/**
 * Turning an ImageNet-1k classification into something worth showing someone
 * about their pet — once we already know whether it is a cat or a dog.
 *
 * The classifier we run in the browser is trained on ImageNet-1k, whose 1000
 * classes happen to include 118 dog breeds (indices 151–268) and 5 cat classes
 * (281–285). That is why breed identification is possible at all without a key,
 * a server or an account — and it is also the honest limit of it:
 *
 *   - Dogs get a real breed guess, from a list that covers most of the breeds
 *     anyone actually owns.
 *   - Cats get five classes, and four of them are coat patterns rather than
 *     breeds ("tabby" is not a breed). So we say "cat" and describe the coat,
 *     and we never claim a cat breed we cannot support.
 * WHY THE SPECIES IS AN INPUT AND NOT AN OUTPUT
 * We measured it: across 24 photographs of known cats, the classifier put four
 * of them confidently in dog classes — a Birman scored 0.797 as a malamute, a
 * Siamese 0.359 as a Cardigan corgi. That is not a threshold problem, because
 * the wrong answers are the confident ones. It follows from the label set: 118
 * of the 1000 classes are dog breeds and 5 are cats, so an unusual cat has 118
 * dog-shaped places to land and 5 cat-shaped ones.
 *
 * So the species is not ours to guess. The visitor taps cat or dog — one tap,
 * on a page that already asks that question elsewhere — and the model is then
 * only asked the question it is good at: which breed, within that species.
 * On 9 dogs of known breed this names 8 exactly and hedges the ninth to a pair
 * containing the right answer.
 *
 * No text here is generated. Every fact is written down and checked, because
 * this feature sits on the public landing page where nobody has agreed to
 * anything yet.
 */

/** ImageNet-1k index ranges. Verified against the model's own config.json:
 *  151 Chihuahua, 268 Mexican hairless, 269 timber wolf, 281 tabby, 285
 *  Egyptian cat, 286 cougar. */
export const DOG_RANGE = [151, 268] as const;
export const WILD_CANID_RANGE = [269, 275] as const;
export const CAT_RANGE = [281, 285] as const;
export const WILD_FELID_RANGE = [286, 293] as const;

/** A sanity check run once against the loaded model. If ImageNet's ordering is
 *  ever not what we assume, every guess below would be confidently wrong, so we
 *  would rather turn the feature off than mislabel someone's dog. */
export const LABEL_SPOT_CHECKS: Array<[number, string]> = [
  [151, "chihuahua"],
  [250, "siberian husky"],
  [281, "tabby"],
];

export type ScanSpecies = "dog" | "cat";

export interface RawPrediction {
  label: string;
  score: number;
  /** ImageNet class index, when the pipeline gives us one. */
  index?: number;
}

export interface PetGuess {
  species: ScanSpecies;
  /** Display breed, or null when we won't claim one. */
  breed: string | null;
  confidence: "high" | "medium" | "low";
  /** Runners-up worth showing, most likely first. Never includes `breed`. */
  looksLike: string[];
  /** Share of the probability mass that landed inside the chosen species. */
  support: number;
  /** Kept for shape; nothing sets it now — see the cat note below. */
  coat: string | null;
}

/** ImageNet labels are comma-separated synonym lists ("tabby, tabby cat"). The
 *  first is the canonical one; the rest are noise on a card like this. */
export function tidyLabel(label: string): string {
  const first = label.split(",")[0].trim();
  return first
    .split(" ")
    .map((w) => (w.length > 2 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function inRange(i: number | undefined, [lo, hi]: readonly [number, number]) {
  return i !== undefined && i >= lo && i <= hi;
}

/**
 * Conservative on purpose. A landing page that tells someone their mixed-breed
 * rescue is "definitely a Beagle" is worse than one that says it looks a bit
 * like one — the second is true more often and costs nothing when it is.
 */
function band(share: number): PetGuess["confidence"] {
  if (share >= 0.65) return "high";
  if (share >= 0.35) return "medium";
  return "low";
}

/**
 * We never name a cat breed. Measured on 24 photographs of twelve known breeds,
 * this got 0 of them right — and, worse, it volunteered a wrong breed for four:
 * two Abyssinians and a Birman came back "Siamese", a British Shorthair came
 * back "Persian".
 *
 * That is not fixable with a threshold, because there is nothing to threshold.
 * ImageNet gives cats five classes, and only two of them ("Persian cat",
 * "Siamese cat") are breeds at all — "tabby" and "tiger cat" are coat patterns
 * that occur across every breed and none, and "Egyptian cat" is in practice an
 * ordinary short-hair. Every cat on earth is being sorted into five boxes, so
 * "Persian" here means "long-haired", not Persian.
 *
 * We tried falling back to the coat instead — "a short-haired cat" rather than
 * a breed. On the same 24 photographs that was wrong about half the time: a
 * Maine Coon came back short-haired, a British Shorthair long-haired, an
 * Abyssinian colourpoint. Lower stakes than a wrong pedigree, but still a claim
 * about someone's animal that we cannot stand behind, so it is gone too.
 *
 * What a cat owner gets instead is an honest "a cat" and something true they
 * probably did not know. That is the whole feature for dogs as well; the breed
 * was never the point.
 */

export function interpret(preds: RawPrediction[], species: ScanSpecies): PetGuess {
  const range = species === "dog" ? DOG_RANGE : CAT_RANGE;
  const inSpecies = preds.filter((p) => inRange(p.index, range));
  const total = preds.reduce((s, p) => s + p.score, 0) || 1;
  const support = inSpecies.reduce((s, p) => s + p.score, 0) / total;

  // Nothing of this species in the top predictions at all — a photo of a sofa,
  // or an animal this label set has no room for.
  if (inSpecies.length === 0) {
    return { species, breed: null, confidence: "low", looksLike: [], support: 0, coat: null };
  }

  // Renormalised within the species: the question is no longer "is this a dog"
  // but "given that it is, which one", so the mass that landed on furniture
  // should not count against the winner.
  const speciesTotal = inSpecies.reduce((s, p) => s + p.score, 0) || 1;
  const best = inSpecies[0];
  const share = best.score / speciesTotal;
  const confidence = band(share);

  if (species === "cat") {
    return { species, breed: null, confidence, looksLike: [], support, coat: null };
  }

  return {
    species,
    breed: confidence === "low" ? null : tidyLabel(best.label),
    confidence,
    looksLike: inSpecies
      .slice(confidence === "low" ? 0 : 1, confidence === "low" ? 3 : 4)
      .map((p) => tidyLabel(p.label)),
    support,
    coat: null,
  };
}
