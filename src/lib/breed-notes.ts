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
  /**
   * Optional, curated PHYSICAL traits — coat, size, build, ears — never
   * temperament, and only where a breed standard states them outright. Same bar
   * as `fact`: if it isn't in the cited source, it doesn't go in. Left off for
   * most breeds; the UI simply shows none.
   */
  traits?: string[];
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
  // ---- toy & companion ----
  "Japanese Spaniel": {
    fact: "The Japanese Chin was a companion of the Japanese imperial court, and probably reached Japan from the Asian mainland centuries before that.",
    source: "AKC breed history",
  },
  "Maltese Dog": {
    fact: "A small companion breed of the Mediterranean, known since antiquity; its long single coat hangs straight and is pure white.",
    source: "AKC breed standard",
    traits: ["Long single coat", "Pure white", "Toy size"],
  },
  "Blenheim Spaniel": {
    fact: "'Blenheim' is the chestnut-and-white colour of the King Charles Spaniel, named after Blenheim Palace, seat of the Dukes of Marlborough who bred it.",
    source: "The Kennel Club breed standard (King Charles Spaniel)",
  },
  Papillon: {
    fact: "Named papillon — French for 'butterfly' — after its large, fringed, upright ears; a continental toy spaniel seen in European portraits for centuries.",
    source: "FCI breed standard no. 77; French etymology",
    traits: ["Large fringed ears", "Toy size"],
  },
  "Toy Terrier": {
    fact: "The English Toy Terrier is a miniature black-and-tan, bred down from the ratting terriers of England's industrial towns.",
    source: "The Kennel Club breed standard (English Toy Terrier)",
    traits: ["Black-and-tan", "Smooth coat", "Toy size"],
  },
  Affenpinscher: {
    fact: "Its name is German for 'monkey-dog' (Affe, monkey), after the look of its face; a small, wiry-coated ratter from Germany.",
    source: "AKC breed standard; German etymology",
    traits: ["Wiry coat", "Toy size"],
  },
  Pomeranian: {
    fact: "The smallest of the spitz breeds, bred down in size in the region of Pomerania from much larger sled- and herding-spitz ancestors; Queen Victoria's small Poms in the 1890s helped fix the tiny modern size.",
    source: "AKC breed history",
    traits: ["Double coat", "Plumed tail", "Toy size"],
  },
  "Brabancon Griffon": {
    fact: "The smooth-coated variety of the Brussels Griffon, from the Brabant region of Belgium; it began as a stable ratter before becoming a companion.",
    source: "FCI breed standard no. 82; AKC breed history",
  },

  // ---- hounds: sighthounds ----
  "Afghan Hound": {
    fact: "A sighthound from the mountains of Afghanistan; its long, fine coat is a cold-climate adaptation, and a mature dog carries a short-haired 'saddle' along the back.",
    source: "AKC breed standard",
    traits: ["Long fine coat", "Saddle on back", "Tall build"],
  },
  Borzoi: {
    fact: "The Russian sighthound once called the Russian Wolfhound; nobles coursed wolves with it in pairs. Its name comes from a Russian root meaning 'swift'.",
    source: "FCI breed standard no. 193; Russian etymology",
    traits: ["Silky coat", "Tall build"],
  },
  "Irish Wolfhound": {
    fact: "One of the tallest of all dog breeds; bred in Ireland to course wolves and elk. It was nearly lost in the 1800s and revived from the 1860s by Capt. George Augustus Graham.",
    source: "AKC breed history",
    traits: ["Rough coat", "Very tall build"],
  },
  "Ibizan Hound": {
    fact: "A sighthound from the Balearic island of Ibiza, marked by its large, upright, mobile ears.",
    source: "AKC breed standard",
    traits: ["Large erect ears", "Lean build"],
  },
  Saluki: {
    fact: "One of the oldest sighthound types, bred by the nomadic peoples of the Middle East to course gazelle across open desert.",
    source: "FCI breed standard no. 269; AKC breed history",
    traits: ["Feathered ears and tail", "Lean build"],
  },
  "Scottish Deerhound": {
    fact: "Bred in Scotland to course red deer across the Highlands; a tall, rough-coated sighthound once kept largely by the nobility.",
    source: "AKC breed history",
    traits: ["Rough coat", "Tall build"],
  },

  // ---- hounds: scent ----
  "Rhodesian Ridgeback": {
    fact: "Bred in southern Africa; a ridge of hair grows forward along the spine, against the lie of the coat. It was used to hold big game, including lion, at bay.",
    source: "FCI breed standard no. 146; AKC breed standard",
    traits: ["Ridge along the back", "Short coat"],
  },
  Basset: {
    fact: "'Basset' comes from the French bas, 'low'. The short legs and heavy build let a hunter follow it on foot as it trailed scent.",
    source: "FCI breed standard no. 163; French etymology",
    traits: ["Short legs", "Long ears", "Heavy build"],
  },
  Bluetick: {
    fact: "The 'bluetick' is its coat — dense black ticking on a white ground that reads as blue-grey. It descends in part from the French Grand Bleu de Gascogne.",
    source: "UKC breed standard (Bluetick Coonhound)",
    traits: ["Ticked blue coat", "Long ears"],
  },
  "Black-and-tan Coonhound": {
    fact: "Bred in America to trail and tree raccoons entirely by scent, working at night; it descends from foxhound and bloodhound stock.",
    source: "AKC breed history",
    traits: ["Black-and-tan", "Long ears"],
  },
  "Walker Hound": {
    fact: "The Treeing Walker Coonhound is named for the Walker family of Kentucky, who developed it from Virginia foxhounds to trail and tree game.",
    source: "AKC breed history",
  },
  "English Foxhound": {
    fact: "Bred in England to hunt fox in packs at the gallop; hunt kennels kept careful stud records from the 18th century, among the oldest of any dog.",
    source: "AKC breed history; Masters of Foxhounds Association records",
  },
  Redbone: {
    fact: "An American coonhound bred for a solid, rich red coat, developed in the southern United States to trail and tree game.",
    source: "AKC breed standard",
    traits: ["Solid red coat", "Long ears"],
  },
  "Norwegian Elkhound": {
    fact: "Norway's national dog, a spitz used to track moose and hold them at bay for the hunter — 'elk' being the European name for the moose.",
    source: "FCI breed standard no. 242; AKC breed history",
    traits: ["Grey double coat", "Curled tail"],
  },
  Otterhound: {
    fact: "A British pack hound bred to hunt otter in rivers; it has a rough, oily double coat and large webbed feet for swimming.",
    source: "AKC breed standard",
    traits: ["Rough oily coat", "Webbed feet"],
  },

  // ---- terriers ----
  "Staffordshire Bullterrier": {
    fact: "Developed in 19th-century England from bulldog-and-terrier crosses, in the Black Country region of Staffordshire.",
    source: "The Kennel Club breed standard",
    traits: ["Smooth coat", "Muscular build"],
  },
  "American Staffordshire Terrier": {
    fact: "The American branch of the bull-and-terrier, bred larger and heavier in the United States and recognised separately from the British Staffordshire Bull Terrier.",
    source: "AKC breed standard",
    traits: ["Smooth coat", "Muscular build"],
  },
  "Bedlington Terrier": {
    fact: "Named after the mining town of Bedlington in Northumberland; its pear-shaped head and trimmed, crisp coat give it a famously lamb-like outline.",
    source: "AKC breed standard",
    traits: ["Curly crisp coat", "Arched back", "Lamb-like outline"],
  },
  "Border Terrier": {
    fact: "From the hill country of the English–Scottish border; small enough to follow fox to ground, yet with leg enough to keep up with mounted hunts. Its head is often likened to an otter's.",
    source: "AKC breed standard; The Kennel Club breed standard",
    traits: ["Wiry coat", "Otter-shaped head"],
  },
  "Kerry Blue Terrier": {
    fact: "From County Kerry in Ireland; puppies are born black and the coat clears to blue-grey as the dog matures.",
    source: "AKC breed standard",
    traits: ["Soft wavy coat", "Blue-grey (born black)"],
  },
  "Irish Terrier": {
    fact: "An Irish breed with a solid red coat; one of the oldest terrier types, it served as a messenger and sentry dog in the First World War.",
    source: "AKC breed history",
    traits: ["Wiry coat", "Solid red"],
  },
  "Norfolk Terrier": {
    fact: "The Norfolk and Norwich Terriers were one breed until the mid-20th century; they are told apart by the ears — the Norfolk's drop forward, the Norwich's stand erect.",
    source: "AKC breed history",
    traits: ["Wiry coat", "Drop ears"],
  },
  "Norwich Terrier": {
    fact: "The Norwich and Norfolk Terriers were one breed until the mid-20th century; they are told apart by the ears — the Norwich's stand erect, the Norfolk's drop forward.",
    source: "AKC breed history",
    traits: ["Wiry coat", "Erect ears"],
  },
  "Wire-haired Fox Terrier": {
    fact: "Bred in England to bolt fox from earth; the wire and smooth Fox Terriers were registered as one breed until the 20th century. Its dense coat is broken and hard.",
    source: "AKC breed standard and history",
    traits: ["Wiry broken coat", "Predominantly white"],
  },
  "Lakeland Terrier": {
    fact: "From the fells of the English Lake District, bred to go to ground after the foxes that raided hill-farm lambs.",
    source: "AKC breed history",
    traits: ["Wiry coat"],
  },
  "Sealyham Terrier": {
    fact: "Developed in the mid-1800s by Capt. John Edwardes at his estate, Sealyham, in Wales, as a white working terrier for badger and otter.",
    source: "AKC breed history",
    traits: ["Wiry coat", "Predominantly white"],
  },
  Airedale: {
    fact: "The largest of the terriers, called the 'King of Terriers'; it was bred in the valley of the River Aire in Yorkshire to hunt otter and vermin.",
    source: "AKC breed standard",
    traits: ["Wiry coat", "Black-and-tan", "Largest terrier"],
  },
  Cairn: {
    fact: "A working terrier of the Scottish Highlands, named for the cairns — piles of stones — it was sent into to bolt fox and vermin.",
    source: "AKC breed history",
    traits: ["Shaggy weather-resistant coat", "Small size"],
  },
  "Australian Terrier": {
    fact: "One of the first breeds developed in Australia, from rough-coated British terriers taken there by settlers, to control rodents and other vermin.",
    source: "AKC breed history",
    traits: ["Harsh coat", "Small size"],
  },
  "Dandie Dinmont": {
    fact: "The only breed named after a fictional character — Dandie Dinmont, a farmer in Sir Walter Scott's 1815 novel Guy Mannering. It has a long low body and a soft topknot of hair.",
    source: "AKC breed history; Guy Mannering (1815)",
    traits: ["Long low body", "Soft topknot"],
  },
  "Boston Bull": {
    fact: "The Boston Terrier was developed in Boston in the 1870s from a bull-and-terrier cross; one of the first breeds made in the United States, marked by a white 'tuxedo' front.",
    source: "AKC breed history",
    traits: ["Smooth coat", "Tuxedo markings", "Erect ears"],
  },
  "Scotch Terrier": {
    fact: "The Scottish Terrier is a short-legged working terrier of the Highlands, bred to go to ground after fox and badger; its harsh double coat and long beard give a distinctive outline.",
    source: "AKC breed standard",
    traits: ["Harsh double coat", "Short legs", "Erect ears"],
  },
  "Tibetan Terrier": {
    fact: "Not a true terrier: a Tibetan companion and watchdog kept in monasteries, with large, flat, snowshoe-like feet suited to mountain and snow.",
    source: "AKC breed standard and history",
    traits: ["Long double coat", "Large flat feet"],
  },
  "Silky Terrier": {
    fact: "The Australian Silky Terrier was developed by crossing Yorkshire and Australian Terriers; a small dog with a fine, silky, blue-and-tan coat.",
    source: "AKC breed standard",
    traits: ["Silky coat", "Blue-and-tan", "Toy size"],
  },
  "Soft-coated Wheaten Terrier": {
    fact: "An Irish farm terrier with a soft, silky coat — unusual among terriers — in a single wheaten colour; pups are born darker and clear to wheaten as they mature.",
    source: "AKC breed standard",
    traits: ["Soft silky coat", "Wheaten colour"],
  },

  // ---- Tibetan / Asian companions ----
  Lhasa: {
    fact: "Named after the Tibetan city of Lhasa, where the Lhasa Apso was kept as an indoor watchdog in homes and monasteries; a long, heavy, parted coat guards against the cold.",
    source: "AKC breed history",
    traits: ["Long heavy coat", "Small size"],
  },

  // ---- sporting: retrievers, pointers, setters ----
  "Flat-coated Retriever": {
    fact: "A British gundog developed in the 19th century to retrieve on land and water, with a flat, glossy, moderately long coat.",
    source: "AKC breed standard",
    traits: ["Flat glossy coat", "Feathering"],
  },
  "Curly-coated Retriever": {
    fact: "One of the oldest retriever breeds; its whole body, bar the face, is covered in a mass of small, tight, water-resistant curls.",
    source: "AKC breed standard",
    traits: ["Tight curled coat"],
  },
  "Chesapeake Bay Retriever": {
    fact: "Developed around Chesapeake Bay to retrieve ducks from cold, rough water; its oily, wavy coat sheds water and resists icing.",
    source: "AKC breed standard",
    traits: ["Oily wavy coat", "Water-resistant"],
  },
  "German Short-haired Pointer": {
    fact: "A German all-round gundog bred to point and then retrieve game on land and from water; webbed feet aid its swimming.",
    source: "FCI breed standard no. 119; AKC breed standard",
    traits: ["Short coat", "Webbed feet"],
  },
  Vizsla: {
    fact: "The Hungarian pointer, an old gundog of the Magyar people; its short coat is a solid golden-rust, and even the nose is self-coloured to match.",
    source: "FCI breed standard no. 57",
    traits: ["Short coat", "Golden-rust", "Self-coloured nose"],
  },
  "English Setter": {
    fact: "A British bird dog that 'sets' — crouches low — on scenting game; its flecked coat pattern is called belton, after a village in Northumberland.",
    source: "AKC breed standard",
    traits: ["Feathered coat", "Belton (flecked) pattern"],
  },
  "Irish Setter": {
    fact: "An Irish gundog known for its solid, rich mahogany-red coat; it was bred down from the older red-and-white setter of Ireland.",
    source: "AKC breed standard",
    traits: ["Feathered coat", "Mahogany-red"],
  },
  "Gordon Setter": {
    fact: "The black-and-tan setter of Scotland, associated with the kennels of the Duke of Gordon around 1800; the largest and most substantial of the setters.",
    source: "AKC breed history",
    traits: ["Feathered coat", "Black-and-tan"],
  },

  // ---- sporting: spaniels ----
  "Brittany Spaniel": {
    fact: "A pointing gundog from the Brittany region of France; many are born with a naturally short tail or none at all.",
    source: "FCI breed standard no. 95; AKC breed standard",
    traits: ["Feathered coat", "Often naturally short tail"],
  },
  Clumber: {
    fact: "The heaviest and most substantial of the spaniels; it takes its name from Clumber Park, seat of the Duke of Newcastle.",
    source: "AKC breed history",
    traits: ["Heavy build", "Predominantly white"],
  },
  "English Springer": {
    fact: "'Springer' comes from its job — springing, or flushing, game birds into flight for the gun. English Springers and Cockers were once sorted from the same litters by size.",
    source: "AKC breed history",
    traits: ["Feathered coat", "Drop ears"],
  },
  "Welsh Springer Spaniel": {
    fact: "A distinct, older breed from the English Springer, always a rich red and white; a flushing gundog long kept in Wales.",
    source: "AKC breed standard and history",
    traits: ["Red-and-white", "Feathered coat"],
  },
  "Cocker Spaniel": {
    fact: "Named for the woodcock it was bred to flush and retrieve; the English and American Cocker are now recognised as separate breeds.",
    source: "AKC breed history",
    traits: ["Feathered coat", "Long drop ears"],
  },
  "Sussex Spaniel": {
    fact: "A low, long-bodied flushing spaniel from the county of Sussex in England; its rich golden-liver coat colour is unique to the breed.",
    source: "AKC breed standard",
    traits: ["Golden-liver coat", "Low long body"],
  },
  "Irish Water Spaniel": {
    fact: "The tallest of the spaniels, from Ireland; it has a curled, oily, water-shedding coat and a distinctive smooth 'rat tail' bare of curls.",
    source: "AKC breed standard",
    traits: ["Curled oily coat", "Smooth 'rat tail'"],
  },

  // ---- herding & flock-guarding ----
  Kuvasz: {
    fact: "An ancient Hungarian livestock-guarding breed — a large white dog set to protect flocks and, historically, the royal court.",
    source: "FCI breed standard no. 54; AKC breed history",
    traits: ["White coat", "Large build"],
  },
  Schipperke: {
    fact: "A small black Belgian dog whose name is Flemish for 'little boatman' (or 'little captain'); it worked as a ratter and watchdog on the canal barges.",
    source: "FCI breed standard no. 83; Flemish etymology",
    traits: ["Black coat", "Erect ears", "Small size"],
  },
  Groenendael: {
    fact: "The all-black, long-haired variety of the Belgian Shepherd, named after the village of Groenendael where it was bred from the 1890s.",
    source: "FCI breed standard no. 15; AKC breed history",
    traits: ["Long coat", "Black"],
  },
  Malinois: {
    fact: "The short-haired, fawn variety of the Belgian Shepherd, named after the city of Mechelen (Malines in French) where it was bred.",
    source: "FCI breed standard no. 15; AKC breed history",
    traits: ["Short coat", "Fawn with black mask"],
  },
  Briard: {
    fact: "An old French herding dog, its name linked to the Brie region; a long coarse coat falls over the eyes. The breed standard requires double dewclaws on each hind leg.",
    source: "FCI breed standard no. 113; AKC breed standard",
    traits: ["Long coarse coat", "Double hind dewclaws"],
  },
  Kelpie: {
    fact: "An Australian sheepdog bred from imported British collies to work vast flocks in the outback heat; it is known for running across the backs of packed sheep in the yards.",
    source: "ANKC / AKC breed history",
    traits: ["Short double coat", "Erect ears"],
  },
  Komondor: {
    fact: "A Hungarian flock-guardian whose white coat forms long felted cords as it matures — protection against both weather and the teeth of wolves.",
    source: "FCI breed standard no. 53; AKC breed standard",
    traits: ["Corded white coat", "Large build"],
  },
  "Old English Sheepdog": {
    fact: "A British drover's dog with a profuse, shaggy double coat; the traditionally docked tail earned it the old nickname 'bobtail'.",
    source: "AKC breed standard and history",
    traits: ["Profuse shaggy coat", "Grey-and-white"],
  },
  "Shetland Sheepdog": {
    fact: "A small herding dog from the Shetland Islands; like the islands' miniature ponies and sheep, it was bred small. It is a distinct breed, not a miniature Collie.",
    source: "AKC breed history",
    traits: ["Long double coat", "Small size"],
  },
  "Bouvier Des Flandres": {
    fact: "A cattle-driving dog of Flanders — bouvier is French for 'cowherd'. Rugged and tousle-coated, it also hauled carts and turned mill wheels.",
    source: "FCI breed standard no. 191; French etymology",
    traits: ["Rough tousled coat", "Beard"],
  },

  // ---- schnauzers & pinschers ----
  "Standard Schnauzer": {
    fact: "'Schnauzer' comes from Schnauze, German for 'muzzle', after the breed's bearded snout. The Standard is the original of the three schnauzer sizes.",
    source: "FCI breed standard no. 182; German etymology",
    traits: ["Wiry coat", "Beard and eyebrows"],
  },
  "Giant Schnauzer": {
    fact: "The largest of the three German schnauzer breeds; it was used in Bavaria to drive cattle and later as a guard and working dog.",
    source: "FCI breed standard no. 181",
    traits: ["Wiry coat", "Beard and eyebrows", "Large build"],
  },
  "Miniature Schnauzer": {
    fact: "The smallest schnauzer, bred down from the Standard in Germany, in part by crossing with the Affenpinscher.",
    source: "AKC breed history",
    traits: ["Wiry coat", "Beard and eyebrows", "Small size"],
  },
  "Miniature Pinscher": {
    fact: "Despite the resemblance it is not a miniature Doberman, but an older, separate German breed; it moves with a high-stepping 'hackney' gait like a carriage horse.",
    source: "AKC breed standard and history",
    traits: ["Smooth coat", "Hackney gait", "Small size"],
  },

  // ---- Swiss mountain dogs ----
  "Greater Swiss Mountain Dog": {
    fact: "The largest of the four Swiss Sennenhund breeds; a tricolour draught dog that pulled carts and drove cattle in the Alps.",
    source: "FCI breed standard no. 58",
    traits: ["Short coat", "Tricolour", "Large build"],
  },
  Appenzeller: {
    fact: "One of the four Swiss Sennenhund breeds, from the Appenzell region; a tricolour herding and draught dog with a tail curled tightly over its back.",
    source: "FCI breed standard no. 46",
    traits: ["Short coat", "Tricolour", "Curled tail"],
  },
  EntleBucher: {
    fact: "The smallest of the four Swiss Sennenhund breeds, named after the Entlebuch valley; a tricolour cattle-herding dog like its larger relatives.",
    source: "FCI breed standard no. 47",
    traits: ["Short coat", "Tricolour"],
  },

  // ---- mastiffs & large working ----
  "Bull Mastiff": {
    fact: "Bred in 19th-century England by gamekeepers, from roughly three parts Mastiff to one part Bulldog, to track and pin poachers on large estates — the 'gamekeeper's night dog'.",
    source: "AKC breed history",
    traits: ["Short coat", "Large build"],
  },
  "Tibetan Mastiff": {
    fact: "A large flock- and home-guarding dog of the Himalaya, built for altitude with a heavy double coat and a mane around the neck and shoulders.",
    source: "FCI breed standard no. 230; AKC breed standard",
    traits: ["Heavy double coat", "Mane", "Large build"],
  },
  Leonberg: {
    fact: "The Leonberger was created in the town of Leonberg, Germany, by Heinrich Essig around the 1840s; a very large working dog said to have been bred to echo the lion on the town's crest.",
    source: "FCI breed standard no. 145; AKC breed history",
    traits: ["Long double coat", "Very large build"],
  },
  "Great Pyrenees": {
    fact: "A livestock-guarding dog of the Pyrenees, a large white dog set to protect flocks from wolves and bears; its breed standard requires double dewclaws on each hind leg.",
    source: "FCI breed standard no. 137; AKC breed standard",
    traits: ["Thick white coat", "Double hind dewclaws", "Large build"],
  },

  // ---- spitz & Arctic ----
  "Eskimo Dog": {
    fact: "An Arctic sled dog of the Inuit, bred to haul sledges and help hunt across the sea ice of the far north; a heavy double coat and a thick, curled tail suit it to the cold.",
    source: "Canadian Kennel Club breed standard (Canadian Eskimo Dog)",
    traits: ["Heavy double coat", "Curled tail"],
  },
  Keeshond: {
    fact: "A Dutch spitz that became the symbol of the 18th-century Patriot party, named after the party figure Kees de Gyselaer; the breed standard prizes the 'spectacles' — shading and markings around each eye.",
    source: "AKC breed standard and history",
    traits: ["Grey double coat", "'Spectacles' eye markings", "Curled tail"],
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
