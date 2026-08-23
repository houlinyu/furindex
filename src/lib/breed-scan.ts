import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/**
 * Identify a pet from a photo and return something delightful about it.
 *
 * Two providers, tried in order of what is configured. Both are optional: with
 * neither key set the endpoint reports that scanning is off rather than 500ing,
 * because this sits on a public page and must never look broken.
 */

export const ScanResultSchema = z.object({
  is_pet: z.boolean().describe("False if the photo isn't a cat or dog at all"),
  species: z.enum(["dog", "cat", "other"]),
  breed: z.string().nullable().describe("Best single breed guess, or null if genuinely unclear"),
  breed_confidence: z.enum(["high", "medium", "low"]),
  looks_like: z
    .array(z.string())
    .describe("Up to 3 breeds this could be, most likely first. Empty for a clear mixed-breed."),
  fun_fact: z
    .string()
    .describe(
      "One genuinely interesting, verifiable fact about this breed or type — 1-2 sentences. Not care advice, not a health claim."
    ),
  temperament: z.array(z.string()).describe("2-4 one-word traits typical of the breed"),
  note: z
    .string()
    .nullable()
    .describe("A warm one-liner about what's visible in the photo. Never about health."),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;

const SYSTEM = `You identify pets in photographs and share one interesting thing
about them.

Rules:
- If the photo is not a cat or dog, set is_pet false and leave the rest minimal.
- Mixed breeds are the common case, not a failure. If it is clearly a mix, set
  breed to null, say so warmly, and list what it resembles in looks_like.
- Never guess a specific pedigree breed confidently from an ambiguous photo. Use
  breed_confidence honestly; "low" is a perfectly good answer.
- The fun fact must be TRUE and specific — breed history, physiology, a genuine
  quirk. Never invent statistics.
- Say NOTHING about the animal's health, weight, age or condition. Not their
  coat, not their eyes, not whether they look well. This is a delight feature on
  a public page, and a stranger's health remark about someone's pet is both
  unwelcome and something we are not equipped to make.
- Keep it warm and brief.`;

export function scanProvider(): "anthropic" | null {
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
}

export async function scanPetPhoto(
  bytes: Uint8Array,
  mediaType: "image/png" | "image/jpeg" | "image/webp"
): Promise<ScanResult> {
  const client = new Anthropic();
  const data = Buffer.from(bytes).toString("base64");

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: "What is this pet, and tell me one interesting thing about it." },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ScanResultSchema), effort: "low" },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Could not read that photo.");
  }
  return response.parsed_output;
}
