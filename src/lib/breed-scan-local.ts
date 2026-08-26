/**
 * Breed identification with no API key, no account and no server.
 *
 * The classifier runs in the visitor's own browser: MobileNetV4-small trained
 * on ImageNet-1k, whose label set happens to contain 118 dog breeds and 5 cat
 * classes. That accident of the dataset is the whole reason this can work for
 * free — and, since it is 118 against 5, also the reason the visitor tells us
 * the species rather than the model guessing it. See lib/imagenet-pets.ts.
 *
 * It also makes the promise on the landing page — "the photo isn't saved" —
 * considerably stronger than it was: the photo is never uploaded anywhere at
 * all. Nothing to save, nothing to keep, no request to trust us about.
 *
 * Same fallback shape as document reading (see lib/extract-request.ts): the
 * server route is tried first and is better when a key is configured; this
 * takes over when it reports that it has none. Client-only — it imports a WASM
 * runtime and must never be pulled into a server bundle.
 */
import type { ScanResult } from "@/lib/breed-scan";
import {
  interpret,
  LABEL_SPOT_CHECKS,
  type RawPrediction,
  type ScanSpecies,
} from "@/lib/imagenet-pets";
import { noteFor } from "@/lib/breed-notes";

const MODEL = "onnx-community/mobilenetv4_conv_medium.e500_r256_in1k";

/** Local result plus the two things the model-backed shape has no room for. */
export interface LocalScanResult extends ScanResult {
  /** Where the fact came from, so it can be checked. */
  fact_source: string;
  /**
   * What to put at the top of the card, when "the breed" is the wrong shape of
   * answer. Cats get their coat here rather than a breed, and the coat must not
   * travel in `breed` — that field pre-fills the pet form, and "a tabby" is not
   * a breed anyone should find typed into their record.
   */
  headline?: string;
  /** The classifier's honest within-species split (dogs only). See PetGuess. */
  breakdown: Array<{ breed: string; pct: number }>;
  on_device: true;
}

type Classifier = (input: string, opts: { top_k: number }) => Promise<
  Array<{ label: string; score: number }>
>;

let loading: Promise<{ run: Classifier; labelIndex: Map<string, number> }> | null = null;

/**
 * Loaded once per page and reused. The first call downloads the weights; the
 * browser caches them, so a second photo is instant.
 */
function load() {
  if (loading) return loading;
  loading = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");

    // Without this the runtime probes /models/... on our own origin first and
    // logs a 404 for every file before falling back to the hub.
    env.allowLocalModels = false;

    // MobileNetV4-conv-medium at fp16 (18 MB). Measured against the small model
    // it replaced on 98 real dog photos: top-1 90.8% -> 92.9%, top-3 96.9% ->
    // 98.0%, and it fixed the hard sighthound case (Whippet 2/6 -> 4/6). The
    // int8/q8 build of this model is NOT usable — it collapses to ~52% top-1,
    // the same quantisation damage the previous model showed — so fp16 is the
    // floor, not a preference. device is pinned to wasm because leaving it to
    // the model card can select a backend the browser lacks, which throws rather
    // than falling back.
    const classifier = await pipeline("image-classification", MODEL, {
      dtype: "fp16",
      device: "wasm",
    });

    // Every range in imagenet-pets.ts assumes the standard ImageNet-1k ordering.
    // If that assumption is ever wrong, this would confidently call a cat a
    // spaniel, so check it against the model's own labels and refuse rather
    // than mislabel.
    const id2label = (classifier as unknown as { model: { config: { id2label?: Record<string, string> } } })
      .model?.config?.id2label;
    if (!id2label) throw new Error("This model has no label map.");
    for (const [index, expected] of LABEL_SPOT_CHECKS) {
      const actual = (id2label[String(index)] ?? "").toLowerCase();
      if (!actual.startsWith(expected)) {
        throw new Error(
          `Label check failed: class ${index} is "${actual}", expected "${expected}".`
        );
      }
    }

    const labelIndex = new Map<string, number>();
    for (const [i, label] of Object.entries(id2label)) labelIndex.set(label, Number(i));

    return {
      run: ((input, opts) =>
        (classifier as unknown as Classifier)(input, opts)) as Classifier,
      labelIndex,
    };
  })();
  return loading;
}

/** True once the weights are in the browser cache and a scan will be instant. */
export function modelIsWarm(): boolean {
  return loading !== null;
}

/**
 * Two extra framings of the same photo — a horizontal flip and a centre-zoom —
 * as data URLs. A dog doesn't change breed when mirrored or cropped a little, so
 * averaging the model's answer over these views cancels the framing-specific
 * quirks that produce a confident WRONG guess (a Golden Retriever read as a
 * Chesapeake Bay off one crop). Best-effort: if the canvas isn't available the
 * caller falls back to the single view.
 */
async function augmentedViews(file: File): Promise<string[]> {
  const bmp = await createImageBitmap(file);
  const { width: w, height: h } = bmp;
  const render = (paint: (ctx: CanvasRenderingContext2D) => void): string => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    paint(ctx);
    return c.toDataURL("image/jpeg", 0.9);
  };
  const flip = render((ctx) => {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(bmp, 0, 0);
  });
  const m = 0.08; // drop the outer 8% — pull the subject in from a busy edge
  const zoom = render((ctx) =>
    ctx.drawImage(bmp, w * m, h * m, w * (1 - 2 * m), h * (1 - 2 * m), 0, 0, w, h)
  );
  bmp.close();
  return [flip, zoom];
}

/** Average the model's per-label scores across several views of one photo. */
function averagePredictions(views: RawPrediction[][]): RawPrediction[] {
  const acc = new Map<string, RawPrediction>();
  for (const view of views) {
    for (const p of view) {
      const e = acc.get(p.label) ?? { label: p.label, score: 0, index: p.index };
      e.score += p.score / views.length;
      acc.set(p.label, e);
    }
  }
  return [...acc.values()].sort((a, b) => b.score - a.score);
}

export async function scanPetPhotoLocally(
  file: File,
  species: ScanSpecies
): Promise<LocalScanResult> {
  const { run, labelIndex } = await load();
  const toPreds = (raw: Array<{ label: string; score: number }>): RawPrediction[] =>
    raw.map((p) => ({ label: p.label, score: p.score, index: labelIndex.get(p.label) }));

  const url = URL.createObjectURL(file);
  let preds: RawPrediction[];
  try {
    const raw = await run(url, { top_k: 8 });
    preds = toPreds(raw);

    // Adaptive test-time augmentation: a photo the model already reads as one
    // dominant breed needs no help and stays fast (one pass). Only when the
    // first look is uncertain or split — exactly where a framing quirk flips the
    // winner — do we spend two more passes on a flip and a zoom and average them.
    const first = interpret(preds, species);
    const dominant = first.confidence === "high" && (first.breakdown[0]?.pct ?? 0) >= 85;
    if (species === "dog" && !dominant && first.support >= 0.02) {
      try {
        const views = await augmentedViews(file);
        const extra = await Promise.all(views.map((v) => run(v, { top_k: 8 }).then(toPreds)));
        preds = averagePredictions([preds, ...extra]);
      } catch {
        // Canvas unavailable or a view failed — keep the single-view result.
      }
    }
  } finally {
    URL.revokeObjectURL(url);
  }

  if (typeof window !== "undefined" && window.location.search.includes("scandebug")) {
    console.log("[scandebug] mapped:", JSON.stringify(preds));
  }

  const guess = interpret(preds, species);
  const note = noteFor(guess.breed, species);

  // Nothing of the stated species anywhere in the top predictions. Say so
  // plainly rather than naming the closest breed anyway — at this point the
  // most likely explanations are a bad photo or a different animal, and both
  // are better answered by asking than by guessing.
  if (guess.support < 0.02) {
    return {
      is_pet: true,
      species,
      breed: null,
      breed_confidence: "low",
      looks_like: [],
      traits: [],
      fun_fact: note.fact,
      fact_source: note.source,
      headline: species === "cat" ? "A cat" : undefined,
      breakdown: [],
      note: `We couldn't pick out a ${species} in that photo, so here's something true about ${species}s instead. A clear, well-lit shot of the whole animal reads best.`,
      on_device: true,
    };
  }

  return {
    is_pet: true,
    species,
    breed: guess.breed,
    breed_confidence: guess.confidence,
    looks_like: guess.looksLike,
    // Only the curated, sourced physical traits from breed-notes, and only when
    // we actually named a breed. Never invented, never temperament — same bar as
    // the fact itself. Most breeds have none, and that shows as none.
    traits: guess.breed ? note.traits ?? [] : [],
    fun_fact: note.fact,
    fact_source: note.source,
    headline: species === "cat" ? "A cat" : undefined,
    breakdown: guess.breakdown,
    note:
      species === "cat"
        ? "We don't guess cat breeds — they can't be told apart from a photo, and most cats aren't a breed anyway. So here's something true instead."
        : null,
    on_device: true,
  };
}
