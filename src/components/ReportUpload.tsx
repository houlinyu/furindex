"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerDocument } from "@/app/document-actions";
import type { Pet } from "@/lib/types";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
// A PDF can be large; a single image cannot — the Anthropic API rejects images
// well below the bucket's 20 MB limit, and a modern phone photo clears 5 MB easily.
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type Phase = "idle" | "uploading" | "reading" | "error";

export default function ReportUpload({
  pets,
  fixedPetId = null,
  compact = false,
}: {
  pets: Pet[];
  /** When set, the upload is filed against this pet and the picker is hidden. */
  fixedPetId?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [petId, setPetId] = useState<string>(fixedPetId ?? "");
  const errorId = useId();

  async function handleFile(file: File) {
    setError(null);

    if (!EXT[file.type]) {
      setError("Upload a PDF or a photo (PNG, JPG or WebP).");
      setPhase("error");
      return;
    }
    const isPdf = file.type === "application/pdf";
    const cap = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
    if (file.size === 0) {
      setError("That file is empty.");
      setPhase("error");
      return;
    }
    if (file.size > cap) {
      setError(
        isPdf
          ? `That PDF is ${(file.size / 1e6).toFixed(1)} MB — the limit is 20 MB.`
          : `That photo is ${(file.size / 1e6).toFixed(1)} MB — images must be under 4.5 MB. Most phones let you share a smaller copy, or take the shot again at lower resolution.`
      );
      setPhase("error");
      return;
    }

    try {
      setPhase("uploading");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired — sign in again.");

      const path = `${user.id}/${crypto.randomUUID()}.${EXT[file.type]}`;
      const { error: upErr } = await supabase.storage
        .from("vet-reports")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      let documentId: string;
      try {
        documentId = await registerDocument({
          storagePath: path,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          petId: fixedPetId ?? petId ?? null,
        });
      } catch (regErr) {
        // The file is already in the bucket. Without this it would sit there
        // forever with nothing referencing it — and storage_path is unique, so
        // that exact path could never be reused.
        await supabase.storage.from("vet-reports").remove([path]);
        throw regErr;
      }

      setPhase("reading");
      const res = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // The upload survived — send them to the review page, which shows the
        // failure and offers a retry rather than losing the file.
        setError(body.error ?? "Couldn't read that document.");
      }
      router.push(`/documents/${documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("error");
    }
  }

  const busy = phase === "uploading" || phase === "reading";

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
          const file = e.dataTransfer.files?.[0];
          if (file && !busy) handleFile(file);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-describedby={error ? errorId : undefined}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          // Space on a role="button" must not fall through to the page scroll.
          e.preventDefault();
          if (!busy) inputRef.current?.click();
        }}
        className={`card cursor-pointer border-dashed ${compact ? "px-4 py-6" : "px-6 py-10"} text-center transition ${
          dragging ? "border-brand-500 bg-brand-50/50" : "hover:border-brand-300"
        } ${busy ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        {phase === "reading" ? (
          <>
            <div className="text-3xl">🔎</div>
            <p className="mt-3 text-sm font-medium">Reading the report…</p>
            <p className="muted mt-1 text-xs">
              Pulling out vaccinations, medications, weight and dates. Takes a few seconds.
            </p>
          </>
        ) : phase === "uploading" ? (
          <>
            <div className="text-3xl">📤</div>
            <p className="mt-3 text-sm font-medium">Uploading…</p>
          </>
        ) : (
          <>
            <div className="text-3xl">📄</div>
            <p className="mt-3 text-sm font-medium">
              Drop a vet report here, or click to choose
            </p>
            <p className="muted mt-1 text-xs">
              PDF up to 20 MB, or a phone photo (PNG, JPG, WebP) up to 4.5 MB.
            </p>
          </>
        )}
      </div>

      {pets.length > 0 && !busy && !fixedPetId && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <label htmlFor="upload-pet" className="muted">
            File under
          </label>
          <select
            id="upload-pet"
            value={petId}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            onChange={(e) => setPetId(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-xs outline-none focus:border-brand-500"
          >
            <option value="">— work it out from the report —</option>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p id={errorId} className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
