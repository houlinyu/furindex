/**
 * Suggestion lists only — the breed input is a free-text field with a datalist,
 * so anything can still be typed. Mixes and unlisted breeds must not be
 * second-class, which is why this is never a <select>.
 */
export const BREEDS: Record<string, string[]> = {
  dog: [
    "Mixed breed", "Labrador Retriever", "Golden Retriever", "German Shepherd",
    "French Bulldog", "Bulldog", "Poodle", "Poodle (Toy)", "Poodle (Miniature)",
    "Beagle", "Rottweiler", "Dachshund", "German Shorthaired Pointer",
    "Pembroke Welsh Corgi", "Australian Shepherd", "Yorkshire Terrier",
    "Cavalier King Charles Spaniel", "Doberman Pinscher", "Boxer",
    "Miniature Schnauzer", "Cane Corso", "Great Dane", "Shih Tzu",
    "Siberian Husky", "Bernese Mountain Dog", "Pomeranian", "Boston Terrier",
    "Havanese", "English Springer Spaniel", "Shetland Sheepdog", "Brittany",
    "Cocker Spaniel", "Border Collie", "Miniature American Shepherd",
    "Vizsla", "Pug", "Chihuahua", "Basset Hound", "Mastiff", "Belgian Malinois",
    "Maltese", "Weimaraner", "Collie", "Newfoundland", "Rhodesian Ridgeback",
    "Shiba Inu", "West Highland White Terrier", "Bichon Frise", "Akita",
    "Bloodhound", "Papillon", "Whippet", "Samoyed", "Jack Russell Terrier",
    "Staffordshire Bull Terrier", "American Pit Bull Terrier", "Greyhound",
    "Saint Bernard", "Alaskan Malamute", "Labradoodle", "Goldendoodle",
    "Cockapoo", "Cavapoo", "Puggle", "Schnoodle",
  ],
  cat: [
    "Domestic Shorthair", "Domestic Longhair", "Domestic Mediumhair",
    "Maine Coon", "Ragdoll", "Siamese", "Persian", "Bengal", "British Shorthair",
    "Abyssinian", "Sphynx", "Scottish Fold", "Russian Blue", "Norwegian Forest Cat",
    "Devon Rex", "Cornish Rex", "American Shorthair", "Oriental Shorthair",
    "Birman", "Burmese", "Exotic Shorthair", "Himalayan", "Tonkinese",
    "Turkish Angora", "Savannah", "Siberian", "Manx", "Ocicat", "Balinese",
    "Egyptian Mau", "Somali", "Selkirk Rex", "Chartreux", "Bombay",
  ],
  bird: [
    "Budgerigar", "Cockatiel", "Lovebird", "African Grey Parrot", "Cockatoo",
    "Macaw", "Conure", "Canary", "Finch", "Amazon Parrot", "Parrotlet",
    "Quaker Parrot", "Eclectus", "Lorikeet", "Pionus", "Caique", "Dove",
  ],
  rabbit: [
    "Holland Lop", "Netherland Dwarf", "Mini Rex", "Lionhead", "Flemish Giant",
    "Mini Lop", "Dutch", "English Lop", "French Lop", "Rex", "Havana",
    "Californian", "New Zealand", "English Angora", "Polish", "Harlequin",
  ],
  reptile: [
    "Bearded Dragon", "Leopard Gecko", "Crested Gecko", "Ball Python",
    "Corn Snake", "Blue-Tongued Skink", "Russian Tortoise", "Red-Eared Slider",
    "Green Iguana", "Chameleon (Veiled)", "Chameleon (Panther)",
    "King Snake", "Milk Snake", "Boa Constrictor", "Uromastyx", "Tegu",
    "Sulcata Tortoise", "Hermann's Tortoise", "Box Turtle",
  ],
  small_mammal: [
    "Syrian Hamster", "Dwarf Hamster", "Guinea Pig (American)",
    "Guinea Pig (Abyssinian)", "Guinea Pig (Peruvian)", "Ferret",
    "Gerbil", "Chinchilla", "Rat (Fancy)", "Mouse", "Hedgehog",
    "Sugar Glider", "Degu", "Prairie Dog",
  ],
  other: [],
};

export function breedsFor(species: string): string[] {
  return BREEDS[species] ?? [];
}
