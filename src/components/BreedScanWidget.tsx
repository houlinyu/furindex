"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ScanResult } from "@/lib/breed-scan";
import { modelIsWarm } from "@/lib/breed-scan-local";
import { factOfTheDay } from "@/lib/pet-facts";
import SpeciesChoice from "@/components/SpeciesChoice";
import {
  clearFunnelIntent,
  isFunnelSpecies,
  previewDataUrl,
  saveFunnelIntent,
  type FunnelSpecies,
} from "@/lib/funnel-intent";

type Phase = "idle" | "asking" | "scanning" | "loading-model" | "done" | "error" | "off";

/**
 * The funnel's first step, and the only one a visitor sees before signing up.
 *
 * WHAT CHANGED AND WHY
 * This widget used to be a cul-de-sac: it worked out the species, often the
 * breed, held the photo — and then handed the visitor a link to a bare login
 * form, after which they retyped everything it had just established. Now every
 * exit from here records what we learned (see lib/funnel-intent) and points at
 * /pets/new, so the work carries across the sign-up boundary.
 *
 * Every call to action goes to /pets/new rather than /login: middleware sends a
 * signed-out visitor to /login?next=/pets/new and brings them back, so one href
 * is correct in both auth states.
 */

/** Where every "yes, keep this" in this widget goes. */
const FUNNEL_HREF = "/pets/new";

export default function BreedScanWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  /** Set when the guess came from the browser rather than from a model. */
  const [factSource, setFactSource] = useState<string | null>(null);
  /** Overrides the breed line when "the breed" is the wrong answer — see cats. */
  const [headline, setHeadline] = useState<string | null>(null);
  /** Held between "we have no key" and the visitor telling us cat or dog. */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [species, setSpecies] = useState<FunnelSpecies | null>(null);
  /**
   * A small JPEG copy of what they dropped, handed to the funnel. Not the
   * original file — see lib/funnel-intent for the size reasoning.
   */
  const [carriedPhoto, setCarriedPhoto] = useState<string | null>(null);

  async function handle(file: File) {
    setError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Upload a PNG, JPG or WebP.");
      setPhase("error");
      return;
    }
    if (file.size > 4.5 * 1024 * 1024) {
      setError(`That photo is ${(file.size / 1e6).toFixed(1)} MB — the limit is 4.5 MB.`);
      setPhase("error");
      return;
    }

    setPreview(URL.createObjectURL(file));
    setPhase("scanning");

    // Kicked off before the request and awaited after it, so the downscale runs
    // alongside the round trip rather than adding to it.
    const previewPromise = previewDataUrl(file);

    const body = new FormData();
    body.append("photo", file);
    const res = await fetch("/api/breed-scan", { method: "POST", body }).catch(() => null);
    const carried = await previewPromise;
    setCarriedPhoto(carried);

    if (!res) {
      setError("Network trouble — try again.");
      setPhase("error");
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A dead box on the primary call to action is worse than a smaller
      // promise kept, so fall back to asking rather than reading.
      if (json.disabled) {
        // No key on the server is not "the feature is off" any more — the
        // browser can do this itself. It needs one thing from the visitor
        // first: which species, because ImageNet's 118-dogs-to-5-cats label set
        // makes that the one question the model is measurably bad at.
        setPendingFile(file);
        setPhase("asking");
        return;
      }
      setError(json.error ?? "That didn't work.");
      setPhase("error");
      return;
    }

    const scan = json.result as ScanResult;
    setResult(scan);
    setPhase("done");

    // Only carry what the scan is actually sure of. A "low"-confidence breed
    // pre-filled into a form reads as a statement about someone's animal, and a
    // wrong guess presented as fact is worse than no guess — so at low
    // confidence the species travels and the breed stays behind.
    if (scan.is_pet && isFunnelSpecies(scan.species)) {
      saveFunnelIntent({
        species: scan.species,
        breed: scan.breed_confidence === "low" ? null : scan.breed,
        source: "scan",
        photo: carried,
      });
    }
  }

  /**
   * Runs the classifier in this browser. The photo never leaves the device,
   * which is why this is allowed to happen without asking anyone to sign up.
   */
  async function scanHere(file: File, species: FunnelSpecies) {
    // The first scan downloads ~3 MB of weights. Saying so beats a spinner that
    // looks stuck on a slow connection.
    setPhase(modelIsWarm() ? "scanning" : "loading-model");
    try {
      const { scanPetPhotoLocally } = await import("@/lib/breed-scan-local");
      const scan = await scanPetPhotoLocally(file, species);
      setResult(scan);
      setFactSource(scan.fact_source);
      setHeadline(scan.headline ?? null);
      setPhase("done");
      if (scan.is_pet && isFunnelSpecies(scan.species)) {
        saveFunnelIntent({
          species: scan.species,
          breed: scan.breed_confidence === "low" ? null : scan.breed,
          source: "scan",
          photo: carriedPhoto,
        });
      }
    } catch (err) {
      // A browser too old for WASM, weights that wouldn't download, a label map
      // that failed its check — all of it lands here, and all of it means the
      // same thing to the visitor: we'll ask instead of guessing. It is logged
      // because a silent fallback is indistinguishable from the feature never
      // having been built.
      console.error("[breed-scan] on-device scan failed:", err);
      setPhase("off");
    }
  }

  /** Shared by the no-key path and the "we couldn't tell" path. */
  function chooseSpecies(chosen: FunnelSpecies) {
    setSpecies(chosen);
    saveFunnelIntent({ species: chosen, source: "choice", photo: carriedPhoto });
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setFactSource(null);
    setHeadline(null);
    setPendingFile(null);
    setError(null);
    setSpecies(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCarriedPhoto(null);
    // Starting over means the last answer was wrong, or about a different
    // animal. Leaving it behind would pre-fill the form with the pet they just
    // rejected.
    clearFunnelIntent();
  }

  const startCta = (
    <Link
      href={FUNNEL_HREF}
      className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
    >
      Start a free record
    </Link>
  );

  // ---- which animal is it? ------------------------------------------------
  if (phase === "asking" && pendingFile) {
    return (
      <div className="card p-6" data-testid="scan-asking">
        <div className="flex flex-col gap-5 sm:flex-row">
          {preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt="The photo you uploaded"
              className="h-28 w-28 shrink-0 rounded-xl object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Cat or dog?</p>
            <p className="muted mt-1 text-sm">
              One tap and we&apos;ll work out the rest. We ask because the
              recogniser knows 118 dog breeds and only a handful of cats, so
              it&apos;s far better at <em>which one</em> than at{" "}
              <em>which species</em> — and we&apos;d rather ask than get it
              confidently wrong.
            </p>
            <div className="mt-4">
              <SpeciesChoice
                onChoose={(chosen) => {
                  setSpecies(chosen);
                  const file = pendingFile;
                  setPendingFile(null);
                  void scanHere(file, chosen);
                }}
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- scanning unavailable: ask instead of read -------------------------
  if (phase === "off") {
    const today = new Date().toISOString().slice(0, 10);
    const fact = species ? factOfTheDay(species, today) : null;

    return (
      <div className="card p-6" data-testid="scan-fallback">
        {!fact ? (
          <>
            <p className="text-sm font-medium">Tell us what you&apos;ve got</p>
            <p className="muted mt-1 text-sm">
              Reading photos is switched off on this deployment — but we can still
              tell you something you probably didn&apos;t know, and start their
              record from here.
            </p>
            <div className="mt-4">
              <SpeciesChoice onChoose={chooseSpecies} size="sm" />
            </div>
          </>
        ) : (
          <>
            <p className="muted text-xs font-medium uppercase tracking-widest">
              {fact.topic}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{fact.body}</p>
            <p className="muted mt-3 text-xs">
              We&apos;ll carry {species === "cat" ? "“cat”" : "“dog”"}
              {carriedPhoto ? " and your photo" : ""} through to the form, so
              there&apos;s less to type.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {startCta}
              <button
                onClick={reset}
                className="muted inline-flex min-h-11 items-center text-xs underline underline-offset-4"
              >
                Start over
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---- result ------------------------------------------------------------
  if (phase === "done" && result) {
    // A scan can come back sure it is an animal but unsure which, or sure it is
    // neither. Both get the same two buttons the no-key path gets: an unsure
    // answer must not be a dead end.
    const scanned = result.is_pet && isFunnelSpecies(result.species) ? result.species : null;
    const carriedSpecies = scanned ?? species;
    const carriedBreed =
      scanned && result.breed && result.breed_confidence !== "low" ? result.breed : null;

    return (
      <div className="card overflow-hidden" data-testid="scan-result">
        <div className="flex flex-col gap-5 p-6 sm:flex-row">
          {preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt="The pet you uploaded"
              className="h-32 w-32 shrink-0 rounded-xl object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            {result.is_pet ? (
              <>
                {/* The banner grades a breed guess. When there is no breed
                    being guessed — cats — "Looks like" over the word "A cat"
                    promises a hedge we are not making. The three dots make the
                    same grade legible at a glance: filled for how sure we are. */}
                {!headline && (
                  <div className="flex items-center gap-2">
                    <p className="muted text-xs font-medium uppercase tracking-widest">
                      {result.breed_confidence === "high"
                        ? "Looks like"
                        : result.breed_confidence === "medium"
                          ? "Probably"
                          : "Best guess"}
                    </p>
                    <span
                      className="flex items-center gap-0.5"
                      aria-label={`Confidence: ${result.breed_confidence}`}
                      title={`Confidence: ${result.breed_confidence}`}
                    >
                      {[0, 1, 2].map((i) => {
                        const filled =
                          i <
                          (result.breed_confidence === "high"
                            ? 3
                            : result.breed_confidence === "medium"
                              ? 2
                              : 1);
                        return (
                          <span
                            key={i}
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full ${
                              filled ? "bg-brand-500" : "bg-[var(--border)]"
                            }`}
                          />
                        );
                      })}
                    </span>
                  </div>
                )}
                <h3 className="mt-1 text-xl font-semibold tracking-tight">
                  {headline ??
                    result.breed ??
                    (result.looks_like.length
                      ? `A mix — maybe ${result.looks_like.slice(0, 2).join(" and ")}`
                      : "A lovely mix")}
                </h3>
                {result.traits.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.traits.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs muted"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {/* The model's runners-up, shown only when we actually named a
                    breed. A named-breed guess is still one guess among several
                    the classifier weighed; saying which keeps "Looks like" from
                    reading as a certainty it isn't. (When breed is null the mix
                    headline above already carries these, so don't repeat them.) */}
                {result.breed && result.looks_like.length > 0 && (
                  <p className="muted mt-2 text-xs">
                    Also a little like {result.looks_like.slice(0, 2).join(" or ")}.
                  </p>
                )}
                <p className="mt-3 text-sm leading-relaxed">
                  <span aria-hidden>💡 </span>
                  {result.fun_fact}
                </p>
                {factSource && (
                  <p className="muted mt-1 text-xs">
                    Source: {factSource}. Worked out in your browser — the photo
                    was never uploaded.
                  </p>
                )}
                {result.note && <p className="muted mt-2 text-sm">{result.note}</p>}
                {result.breed && (
                  <p className="muted mt-3 border-t border-[var(--border)] pt-2 text-xs leading-relaxed">
                    Breed tells you a lot about how a dog looks and very little
                    about who they are — about 9% of the behavioural differences
                    between individual dogs, in a study of 18,385 of them. Whatever
                    yours turns out to be, they&apos;ll mostly be themselves.
                  </p>
                )}
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold tracking-tight">
                  That doesn&apos;t look like a cat or a dog
                </h3>
                <p className="muted mt-2 text-sm">
                  Try a photo where the animal&apos;s face is reasonably clear — or
                  tell us below and carry on anyway.
                </p>
              </>
            )}

            {/* Unsure is a fork, not a failure: the same question, asked plainly. */}
            {!scanned && !species && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <p className="text-sm font-medium">Which is it?</p>
                <div className="mt-3">
                  <SpeciesChoice onChoose={chooseSpecies} size="sm" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-brand-50/40 px-6 py-4 dark:bg-brand-500/10">
          <div className="min-w-0 flex-1 basis-56">
            <p className="muted text-sm">
              Want to keep this — with their vaccinations, weight and vet visits?
            </p>
            {carriedSpecies && (
              <p className="muted mt-1 text-xs">
                We&apos;ll carry {carriedSpecies === "cat" ? "“cat”" : "“dog”"}
                {carriedBreed ? ` and “${carriedBreed}”` : ""}
                {carriedPhoto ? " and your photo" : ""} through to the form.
              </p>
            )}
          </div>
          {startCta}
          <button
            onClick={reset}
            className="inline-flex min-h-11 items-center muted text-xs underline underline-offset-4"
          >
            Try another
          </button>
        </div>
      </div>
    );
  }

  // ---- dropzone ----------------------------------------------------------
  const busy = phase === "scanning" || phase === "loading-model";
  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) handle(f);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload a photo of your pet to identify the breed"
        className={`card cursor-pointer border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-brand-500 bg-brand-50/50 dark:bg-brand-500/10" : "hover:border-brand-300"
        } ${busy ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          aria-label="Choose a photo of your pet"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handle(f);
            e.target.value = "";
          }}
        />
        {busy ? (
          <>
            <div className="text-3xl">🔎</div>
            <p className="mt-3 text-sm font-medium">
              {phase === "loading-model" ? "Getting ready…" : "Looking…"}
            </p>
            {phase === "loading-model" && (
              <p className="muted mt-1 text-xs">
                Downloading the recogniser to your browser — about 14 MB, once.
                After this it takes a second or two, and your photo never leaves
                this device.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="text-3xl">📸</div>
            <p className="mt-3 text-sm font-medium">
              Drop a cute photo of your furry friend — no account needed
            </p>
            <p className="muted mt-1 text-xs">
              We&apos;ll tell you what we think they are, and something you might not know.
              The photo isn&apos;t saved.
            </p>
          </>
        )}
      </div>

      {error && (
        <p
          className="mt-3 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* The photos are on the phone and the visitor is on a laptop. Without
          this, that person's only way in is the generic "Start free" button that
          drops them on a blank form. */}
      <p className="muted mt-3 text-center text-xs">
        No photo to hand?{" "}
        <Link href="/start" className="underline underline-offset-4 hover:text-[var(--brand-text)]">
          Just tell us cat or dog
        </Link>
        .
      </p>
    </div>
  );
}
