/**
 * Hand-written mirror of supabase/schema.sql.
 * Once the schema settles, replace this file with generated types:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types.ts
 */

export type PetSpecies =
  | "dog" | "cat" | "bird" | "rabbit" | "reptile" | "small_mammal" | "other";
export type PetSex = "male" | "female" | "unknown";

export type Pet = {
  id: string;
  owner_id: string;
  name: string;
  species: PetSpecies;
  breed: string | null;
  sex: PetSex;
  birth_date: string | null;
  microchip_id: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Vaccination = {
  id: string;
  pet_id: string;
  name: string;
  administered_on: string;
  due_on: string | null;
  vet_clinic: string | null;
  lot_number: string | null;
  notes: string | null;
  created_at: string;
};

export type Medication = {
  id: string;
  pet_id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

export type WeightLog = {
  id: string;
  pet_id: string;
  recorded_on: string;
  weight_kg: number;
  created_at: string;
};

export type VetVisit = {
  id: string;
  pet_id: string;
  visited_on: string;
  clinic: string | null;
  reason: string | null;
  diagnosis: string | null;
  notes: string | null;
  cost_cents: number | null;
  created_at: string;
};

// ---------------------------------------------------------------- documents --
export type DocumentStatus = "uploaded" | "extracting" | "extracted" | "failed" | "applied";

export type PetDocument = {
  id: string;
  pet_id: string | null;
  owner_id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: DocumentStatus;
  extracted: unknown | null;
  extraction_error: string | null;
  applied_at: string | null;
  created_at: string;
};

// ----------------------------------------------------------- custom fields --
export type FieldType = "text" | "number" | "date" | "boolean";

export type FieldDefinition = {
  id: string;
  owner_id: string;
  label: string;
  field_type: FieldType;
  unit: string | null;
  scope: "pet" | "event";
  created_at: string;
};

export type CustomValue = {
  id: string;
  owner_id: string;
  pet_id: string;
  definition_id: string;
  document_id: string | null;
  recorded_on: string;
  value_text: string | null;
  value_number: number | null;
  value_date: string | null;
  value_bool: boolean | null;
  created_at: string;
};

// -------------------------------------------------------------- daily fact --
export type DailyFact = {
  id: string;
  owner_id: string;
  fact_date: string;
  body: string;
  topic: string | null;
  created_at: string;
};

// --------------------------------------------------------------- community --
export type CommunityProfile = {
  id: string;
  display_name: string;
  bio: string | null;
  avatar_emoji: string | null;
  city: string | null;
  is_public: boolean;
  created_at: string;
};

export type CommunityPet = {
  id: string;
  owner_id: string;
  source_pet_id: string | null;
  name: string;
  species: PetSpecies;
  breed: string | null;
  bio: string | null;
  avatar_emoji: string | null;
  created_at: string;
};

export type CommunityPost = {
  id: string;
  author_id: string;
  pet_name: string | null;
  community_pet_id: string | null;
  body: string;
  created_at: string;
};

export type PostReaction = {
  post_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type ReactionEmoji = "❤️" | "🐾" | "😂" | "💪" | "🙏";
export const REACTION_EMOJI: ReactionEmoji[] = ["❤️", "🐾", "😂", "💪", "🙏"];

// ------------------------------------------------------------------ journal --
export type JournalCategory =
  | "symptom" | "behaviour" | "mood" | "appetite" | "energy" | "other";

export type JournalEntry = {
  id: string;
  pet_id: string;
  owner_id: string;
  occurred_on: string;
  category: JournalCategory;
  title: string;
  body: string | null;
  severity: number | null;
  photo_path: string | null;
  created_at: string;
};

export const JOURNAL_CATEGORY_LABEL: Record<JournalCategory, string> = {
  symptom: "Symptom",
  behaviour: "Behaviour",
  mood: "Mood",
  appetite: "Appetite",
  energy: "Energy",
  other: "Other",
};

export const JOURNAL_CATEGORY_EMOJI: Record<JournalCategory, string> = {
  symptom: "🩺",
  behaviour: "🐾",
  mood: "🙂",
  appetite: "🍽️",
  energy: "⚡",
  other: "📝",
};

// ----------------------------------------------------------------- schema ---
type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

/**
 * Shape must match what supabase-js expects for a schema, or every query
 * silently degrades to `never`. Views/CompositeTypes use the `{ [_ in never]: never }`
 * form that `supabase gen types` emits — `Record<string, never>` does NOT satisfy
 * the constraint.
 */
export type Database = {
  public: {
    Tables: {
      profiles: Row<{ id: string; full_name: string | null; created_at: string }>;
      pets: Row<Pet>;
      vaccinations: Row<Vaccination>;
      medications: Row<Medication>;
      weight_logs: Row<WeightLog>;
      vet_visits: Row<VetVisit>;
      documents: Row<PetDocument>;
      field_definitions: Row<FieldDefinition>;
      custom_values: Row<CustomValue>;
      daily_facts: Row<DailyFact>;
      community_profiles: Row<CommunityProfile>;
      community_pets: Row<CommunityPet>;
      community_posts: Row<CommunityPost>;
      post_reactions: Row<PostReaction>;
      insurance_policies: Row<InsurancePolicy>;
      insurance_claims: Row<InsuranceClaim>;
      journal_entries: Row<JournalEntry>;
    };
    Views: { [_ in never]: never };
    Functions: {
      owns_pet: { Args: { p_pet_id: string }; Returns: boolean };
    };
    Enums: {
      pet_species: PetSpecies;
      pet_sex: PetSex;
      document_status: DocumentStatus;
      field_type: FieldType;
      claim_status: ClaimStatus;
      journal_category: JournalCategory;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

// --------------------------------------------------------------- insurance --
export type ClaimStatus =
  | "draft" | "submitted" | "in_review" | "approved"
  | "partially_paid" | "paid" | "denied";

export type InsurancePolicy = {
  id: string;
  pet_id: string;
  owner_id: string;
  provider: string;
  policy_number: string | null;
  plan_name: string | null;
  start_date: string | null;
  end_date: string | null;
  monthly_premium_cents: number | null;
  deductible_cents: number | null;
  reimbursement_pct: number | null;
  annual_limit_cents: number | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
};

export type InsuranceClaim = {
  id: string;
  policy_id: string;
  pet_id: string;
  owner_id: string;
  document_id: string | null;
  claim_number: string | null;
  service_date: string;
  description: string | null;
  amount_claimed_cents: number | null;
  amount_paid_cents: number | null;
  status: ClaimStatus;
  submitted_on: string | null;
  resolved_on: string | null;
  notes: string | null;
  created_at: string;
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  partially_paid: "Partly paid",
  paid: "Paid",
  denied: "Denied",
};

/** Common US/UK providers — a datalist, so anything can still be typed. */
export const INSURERS = [
  "Trupanion", "Healthy Paws", "Nationwide", "Lemonade", "Embrace", "Figo",
  "ASPCA Pet Health Insurance", "Pets Best", "MetLife Pet Insurance",
  "Fetch by The Dodo", "Spot", "Pumpkin", "Prudent Pet", "Hartville",
  "Petplan", "Bought By Many / ManyPets", "Agria", "Direct Line", "Animal Friends",
];
