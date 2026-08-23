/**
 * A small, curated set of verifiable facts, used when photo scanning is not
 * configured. The landing page's main call to action must never be a dead box:
 * without a key the widget asks what the animal is instead of reading it from
 * the photo, and still returns something worth reading.
 *
 * Every fact here is a well-established, checkable claim about anatomy,
 * physiology or history — nothing statistical, nothing clinical, and nothing
 * about behaviour that breed does not actually predict.
 */
export type CuratedFact = { topic: string; body: string };

export const PET_FACTS: Record<"dog" | "cat", CuratedFact[]> = {
  dog: [
    {
      topic: "Their nose is a fingerprint",
      body: "The pattern of ridges and creases on a dog's nose is unique to that individual and stable for life. Some kennel clubs have accepted nose prints as identification.",
    },
    {
      topic: "They sweat through their feet",
      body: "Dogs have almost no sweat glands in their skin. The ones they do have are concentrated in the pads of their paws, which is why a warm dog leaves damp prints on a hard floor.",
    },
    {
      topic: "Three eyelids, not two",
      body: "Dogs have a third eyelid — the nictitating membrane — that sweeps across the eye from the inner corner, spreading tear film and shielding the cornea.",
    },
    {
      topic: "They see blue and yellow",
      body: "Dogs have two types of colour receptor rather than our three. Reds and greens fall together for them, which is why a red ball on green grass is found by scent and movement, not colour.",
    },
    {
      topic: "Wet noses are working noses",
      body: "A dog's nose is kept damp by mucus and licking. The moisture dissolves airborne molecules so they can be detected, which is part of why a dog's sense of smell so far outstrips ours.",
    },
    {
      topic: "The tail is a rudder",
      body: "Swimming dogs use the tail to steer, and running dogs use it as a counterweight through tight turns. Breeds developed for water work tend to have thick, muscular tails.",
    },
  ],
  cat: [
    {
      topic: "Their nose print is unique too",
      body: "The ridge pattern on a cat's nose leather is individual, in the same way a human fingerprint is.",
    },
    {
      topic: "The purr is not only for pleasure",
      body: "Cats purr when content, but also when injured, giving birth, or near death. The behaviour appears to be self-soothing as much as communicative.",
    },
    {
      topic: "They have a collarbone that floats",
      body: "A cat's clavicle isn't attached to the rest of the skeleton by bone, only by muscle. That is what lets a cat squeeze through any gap its head fits through.",
    },
    {
      topic: "Whiskers are measuring instruments",
      body: "Whiskers are rooted far deeper than ordinary hairs and are rich in nerve endings. They detect air currents and confirm whether a gap is passable in the dark.",
    },
    {
      topic: "They walk like a giraffe",
      body: "Cats move both legs on one side before both on the other — a gait shared with giraffes and camels, and unusual among mammals.",
    },
    {
      topic: "A cat's hearing outruns a dog's",
      body: "Cats hear well above the human range, into ultrasound. It is thought to be an adaptation for locating rodents, which communicate at those frequencies.",
    },
  ],
};

/** Stable per day per species, so a reload doesn't reshuffle it. */
export function factOfTheDay(species: "dog" | "cat", dateISO: string): CuratedFact {
  const list = PET_FACTS[species];
  let h = 0;
  for (const ch of `${species}:${dateISO}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
