/**
 * Written-down, checked facts to show alongside a breed guess.
 *
 * Nothing here is generated at runtime. This feature runs with no API key and
 * no model that writes prose, which is a feature rather than a limitation: a
 * language model asked for "a fun fact about a Weimaraner" will happily invent
 * a plausible one, and this sits on the public landing page where the reader
 * has agreed to nothing and has no reason to doubt us.
 *
 * Rules for anything added here:
 *   1. History, origin, physiology or physical traits. Never temperament —
 *      breed accounts for roughly 9% of the behavioural variation between
 *      individual dogs (Morrill et al., Science 2022, n=18,385), so a breed
 *      name predicts how a dog looks far better than how one behaves.
 *   2. Never health, weight, age or condition. We are not looking at a patient,
 *      and an unsolicited health remark about a stranger's animal is not ours
 *      to make.
 *   3. A `source` you could actually check. If you cannot write one, the fact
 *      does not go in.
 */

export interface BreedNote {
  fact: string;
  source: string;
}

/** Keyed by the tidied ImageNet label (see tidyLabel in imagenet-pets.ts). */
export const BREED_NOTES: Record<string, BreedNote> = {
  Chihuahua: {
    fact: "The smallest recognised dog breed, named after the Mexican state where it was first described to the outside world in the 1850s.",
    source: "AKC breed standard; Mexican state of Chihuahua",
  },
  Dalmatian: {
    fact: "Dalmatian puppies are born pure white. The spots develop over the first few weeks.",
    source: "AKC breed standard",
  },
  Basenji: {
    fact: "Basenjis don't bark like other dogs — the shape of the larynx produces a yodel instead.",
    source: "AKC breed standard",
  },
  Beagle: {
    fact: "Beagles are used as agricultural detector dogs at airports, working by scent rather than sight.",
    source: "USDA APHIS 'Beagle Brigade'",
  },
  Bloodhound: {
    fact: "The bloodhound's scent-trailing is reliable enough that its evidence has been admitted in US courts.",
    source: "Long-standing US case law on scent-trailing evidence",
  },
  "Labrador Retriever": {
    fact: "Despite the name, the breed comes from Newfoundland, not Labrador — it descends from the St John's water dog.",
    source: "AKC breed history",
  },
  "Golden Retriever": {
    fact: "Developed in the Scottish Highlands from the 1860s by Dudley Marjoribanks, later Lord Tweedmouth, whose breeding records survive.",
    source: "Tweedmouth stud books, 1868–1890",
  },
  "German Shepherd": {
    fact: "Standardised from 1899 by Max von Stephanitz, who registered the first dog of the breed, Horand von Grafrath.",
    source: "Verein für Deutsche Schäferhunde founding records",
  },
  Rottweiler: {
    fact: "Named after the German town of Rottweil, where the breed's ancestors drove cattle for butchers.",
    source: "ADRK breed history",
  },
  "Great Dane": {
    fact: "Not Danish. The breed is German — its name there is Deutsche Dogge.",
    source: "FCI breed standard no. 235",
  },
  "Saint Bernard": {
    fact: "Named after the hospice at the Great St Bernard Pass in the Alps, where the dogs worked from the 1600s.",
    source: "Great St Bernard Hospice records",
  },
  Weimaraner: {
    fact: "Developed at the court of Weimar in Germany for hunting large game, which is where the name comes from.",
    source: "FCI breed standard no. 99",
  },
  "Siberian Husky": {
    fact: "Bred by the Chukchi people of north-eastern Siberia as a long-distance sled dog.",
    source: "AKC breed history",
  },
  Malamute: {
    fact: "Named after the Mahlemiut, an Inupiaq people of north-western Alaska who bred it to haul heavy freight.",
    source: "AKC breed history",
  },
  Samoyed: {
    fact: "Named after the Samoyedic peoples of Siberia, who used the dogs for herding reindeer and hauling sledges.",
    source: "AKC breed history",
  },
  Dachshund: {
    fact: "The name is German for 'badger dog' — Dachs, badger, plus Hund, dog. The build is for going down setts.",
    source: "German etymology; FCI breed standard no. 148",
  },
  "Standard Poodle": {
    fact: "A German water retriever, not a French one. 'Pudel' comes from pudeln, to splash about.",
    source: "FCI breed standard no. 172 (country of origin: France/Germany); German etymology",
  },
  "Miniature Poodle": {
    fact: "The poodle's clip was originally functional — coat left over the joints and chest for warmth in cold water, and shaved elsewhere for speed.",
    source: "FCI breed standard no. 172",
  },
  "Toy Poodle": {
    fact: "The poodle's clip was originally functional — coat left over the joints and chest for warmth in cold water, and shaved elsewhere for speed.",
    source: "FCI breed standard no. 172",
  },
  Pug: {
    fact: "Pugs reached Europe from China with Dutch traders in the 16th century, and became the House of Orange's dog.",
    source: "Documented Dutch East India Company trade; House of Orange records",
  },
  Pekinese: {
    fact: "Kept in the Chinese imperial palace, where for centuries removing one was a capital offence.",
    source: "Qing court records",
  },
  "Shih-Tzu": {
    fact: "The name means 'lion dog' in Chinese; the breed was kept in the Chinese imperial court.",
    source: "Chinese etymology; AKC breed history",
  },
  Chow: {
    fact: "The chow chow has a blue-black tongue — a trait it shares with only one other breed, the shar-pei.",
    source: "AKC breed standard",
  },
  Pembroke: {
    fact: "Pembroke Welsh corgis were cattle drovers. The low body kept them under the kick of the cattle they were nipping.",
    source: "AKC breed history",
  },
  Cardigan: {
    fact: "The Cardigan Welsh corgi is the older of the two corgi breeds and keeps its long tail; the Pembroke is a separate breed.",
    source: "AKC breed history",
  },
  "Border Collie": {
    fact: "Border collies herd using 'eye' — controlling stock by staring them down rather than by barking or nipping.",
    source: "International Sheep Dog Society trial standards",
  },
  Collie: {
    fact: "The rough collie's long, narrow head shape is one of the most heritable traits in dogs — skull shape is largely fixed by breed.",
    source: "Schoenebeck & Ostrander, Annu Rev Anim Biosci 2014 (canine skull morphology)",
  },
  Newfoundland: {
    fact: "Newfoundlands have webbed feet and a water-resistant double coat, and were kept aboard ships for water rescue.",
    source: "AKC breed standard",
  },
  Whippet: {
    fact: "Whippets carry a mutation in the myostatin gene; dogs with two copies are visibly heavily muscled 'bully' whippets.",
    source: "Mosher et al., PLOS Genetics 2007;3(5):e79",
  },
  Greyhound: {
    fact: "Greyhounds reach roughly 70 km/h, which makes them the fastest dogs and second only to the cheetah among land mammals over a sprint.",
    source: "Measured racing speeds; Usherwood & Wilson, Nature 2005 (greyhound locomotion)",
  },
  "Italian Greyhound": {
    fact: "The breed appears in Mediterranean art more than 2,000 years old, as a miniature sighthound kept as a companion.",
    source: "Classical Mediterranean iconography; AKC breed history",
  },
  Boxer: {
    fact: "A German breed, developed from the now-extinct Bullenbeisser used for holding large game.",
    source: "FCI breed standard no. 144",
  },
  "French Bulldog": {
    fact: "Developed in France from small bulldogs taken over by English lacemakers who moved to Normandy in the 1800s.",
    source: "AKC breed history",
  },
  "Bernese Mountain Dog": {
    fact: "One of four Swiss mountain breeds, used around Bern to pull carts of milk and cheese to market.",
    source: "FCI breed standard no. 45",
  },
  Doberman: {
    fact: "Named after Karl Friedrich Louis Dobermann, a German tax collector who developed the breed in the 1890s.",
    source: "FCI breed standard no. 143",
  },
  "West Highland White Terrier": {
    fact: "Bred white on purpose in Scotland, so a working terrier could not be mistaken for a fox and shot.",
    source: "AKC breed history",
  },
  "Yorkshire Terrier": {
    fact: "A Victorian working dog from the mills and mines of Yorkshire, bred down in size from larger Scottish terriers.",
    source: "AKC breed history",
  },
  "Mexican Hairless": {
    fact: "The Xoloitzcuintli is one of the oldest dog types in the Americas; its hairlessness comes from a single dominant mutation in FOXI3.",
    source: "Drögemüller et al., Science 2008;321(5895):1462",
  },
  Dingo: {
    fact: "Dingoes arrived in Australia at least 3,500 years ago and are a distinct lineage from modern domestic dogs.",
    source: "Australian archaeological record; Cairns & Wilton, Genetica 2016",
  },
  // ---- cats ----
  "Siamese Cat": {
    fact: "Siamese colouring is temperature-controlled: the pigment enzyme only works in the cooler parts of the body, which is why the points are dark.",
    source: "Temperature-sensitive tyrosinase (TYR) allele — Lyons et al., Anim Genet 2005",
  },
  "Persian Cat": {
    fact: "The long coat is a single recessive gene, FGF5 — the same gene behind long hair in several other cat breeds.",
    source: "Drögemüller et al., Anim Genet 2007 (FGF5 and feline long hair)",
  },
  Tabby: {
    fact: "Tabby is the wild-type coat, not a breed — the mackerel pattern comes from the Taqpep gene, and a mutation in it produces the blotched pattern instead.",
    source: "Kaelin et al., Science 2012;337(6101):1536",
  },
  "Tiger Cat": {
    fact: "Tabby is the wild-type coat, not a breed — the mackerel pattern comes from the Taqpep gene, and a mutation in it produces the blotched pattern instead.",
    source: "Kaelin et al., Science 2012;337(6101):1536",
  },
  "Egyptian Cat": {
    fact: "ImageNet's 'Egyptian cat' is really a short-haired cat of no particular breed — most cats worldwide are exactly that, rather than any pedigree.",
    source: "ImageNet-1k class definition; pedigree cats are a small minority of the cat population",
  },
};

/** Shown when we know the species but have nothing breed-specific to add. */
export const SPECIES_NOTES: Record<"dog" | "cat", BreedNote> = {
  dog: {
    fact: "Breed predicts how a dog looks far better than how they behave. Across 18,385 dogs, breed explained only about 9% of the behavioural variation between individuals.",
    source: "Morrill et al., Science 2022;376(6592):eabk0639",
  },
  cat: {
    fact: "Cats cannot taste sweetness — the Tas1r2 gene that makes up half the sweet receptor is a non-functional pseudogene in cats.",
    source: "Li et al., PLOS Genetics 2005;1(1):e3",
  },
};

export function noteFor(breed: string | null, species: "dog" | "cat"): BreedNote {
  if (breed && BREED_NOTES[breed]) return BREED_NOTES[breed];
  return SPECIES_NOTES[species];
}
