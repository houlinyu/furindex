import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SPECIES_LABEL, ageFromBirthDate } from "@/lib/format";
import type { Pet } from "@/lib/types";

const FactSchema = z.object({
  topic: z.string().describe("Two or three words naming the subject, e.g. 'Dental care'"),
  body: z
    .string()
    .describe("The fact itself, 2-3 sentences, addressed to the owner in plain language"),
});

export type GeneratedFact = z.infer<typeof FactSchema>;

const SYSTEM = `You write one short, genuinely interesting daily note for a pet
owner, tailored to the animals they actually keep.

- Be specific and true. A surprising, verifiable fact beats a vague tip.
- Ground it in the species, breed and life stage you're given. A note for a
  senior cat should not read like one for a puppy.
- Never give diagnostic or dosing advice, and never suggest a specific treatment.
  If something warrants a vet, say so plainly and briefly.
- No emoji, no exclamation marks, no "Did you know". Just say the thing.
- 2-3 sentences.`;

export async function generateDailyFact(
  pets: Pet[],
  dateISO: string
): Promise<GeneratedFact> {
  const client = new Anthropic();

  const roster = pets.length
    ? pets
        .map((p) =>
          [
            p.name,
            SPECIES_LABEL[p.species] ?? p.species,
            p.breed,
            ageFromBirthDate(p.birth_date),
            p.sex !== "unknown" ? p.sex : null,
          ]
            .filter(Boolean)
            .join(", ")
        )
        .join("; ")
    : "no pets recorded yet";

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Today is ${dateISO}. This owner keeps: ${roster}.

Write today's note. Vary the subject from day to day — behaviour, physiology, preventive care, nutrition, senses, history of the breed. Pick whichever is most relevant to these particular animals today.`,
      },
    ],
    output_config: { format: zodOutputFormat(FactSchema), effort: "low" },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Could not generate today's note");
  }
  return response.parsed_output;
}
