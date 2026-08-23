"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ScanResult } from "@/lib/breed-scan";
import { factOfTheDay } from "@/lib/pet-facts";

type Phase = "idle" | "scanning" | "done" | "error" | "off";

export default function BreedScanWidget() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [species, setSpecies] = useState<"dog" | "cat" | null>(null);

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

    const body = new FormData();
    body.append("photo", file);
    const res = await fetch("/api/breed-scan", { method: "POST", body }).catch(() => null);

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
        setPhase("off");
        return;
      }
      setError(json.error ?? "That didn't work.");
      setPhase("error");
      return;
    }
    setResult(json.result as ScanResult);
    setPhase("done");
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  }

  // ---- scanning unavailable: ask instead of read -------------------------
  if (phase === "off") {
    const today = new Date().toISOString().slice(0, 10);
    const fact = species ? factOfTheDay(species, today) : null;

    return (
      <div className="card p-6">
        {!fact ? (
          <>
            <p className="text-sm font-medium">Tell us what you&apos;ve got</p>
            <p className="muted mt-1 text-sm">
              Reading photos is switched off on this deployment — but we can still
              tell you something you probably didn&apos;t know.
            </p>
            <div className="mt-4 flex gap-3">
              {(["dog", "cat"] as const).map((s2) => (
                <button
                  key={s2}
                  onClick={() => setSpecies(s2)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:border-brand-500 hover:text-[var(--brand-text)]"
                >
                  <span aria-hidden>{s2 === "dog" ? "🐕" : "🐈"}</span>
                  {s2 === "dog" ? "A dog" : "A cat"}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="muted text-xs font-medium uppercase tracking-widest">
              {fact.topic}
            </p>
            <p className="mt-2 text-sm leading-relaxed">{fact.body}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Start a free record
              </Link>
              <button
                onClick={() => {
                  setSpecies(null);
                  setPhase("idle");
                }}
                className="muted text-xs underline underline-offset-4"
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
    return (
      <div className="card overflow-hidden">
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
                <p className="muted text-xs font-medium uppercase tracking-widest">
                  {result.breed_confidence === "high"
                    ? "Looks like"
                    : result.breed_confidence === "medium"
                      ? "Probably"
                      : "Best guess"}
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight">
                  {result.breed ??
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
                <p className="mt-3 text-sm leading-relaxed">
                  <span aria-hidden>💡 </span>
                  {result.fun_fact}
                </p>
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
                  Try a photo where the animal&apos;s face is reasonably clear.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] bg-brand-50/40 px-6 py-4">
          <p className="muted flex-1 text-sm">
            Want to keep this — with their vaccinations, weight and vet visits?
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Start a free record
          </Link>
          <button onClick={reset} className="inline-flex min-h-11 items-center muted text-xs underline underline-offset-4">
            Try another
          </button>
        </div>
      </div>
    );
  }

  // ---- dropzone ----------------------------------------------------------
  const busy = phase === "scanning";
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
          dragging ? "border-brand-500 bg-brand-50/50" : "hover:border-brand-300"
        } ${busy ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
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
            <p className="mt-3 text-sm font-medium">Looking…</p>
          </>
        ) : (
          <>
            <div className="text-3xl">📸</div>
            <p className="mt-3 text-sm font-medium">
              Drop a photo of your pet — no account needed
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
    </div>
  );
}
