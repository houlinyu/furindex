import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ExtractionReview from "@/components/ExtractionReview";
import RetryExtraction from "@/components/RetryExtraction";
import { createClient, getUser } from "@/lib/supabase/server";
import { deleteDocument } from "@/app/document-actions";
import type { ExtractedReport } from "@/lib/extraction";
import type { Pet, PetDocument } from "@/lib/types";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const supabase = await createClient();

  const [{ data: doc }, { data: pets }] = await Promise.all([
    supabase.from("documents").select("*").eq("id", id).maybeSingle(),
    supabase.from("pets").select("*").order("name"),
  ]);
  if (!doc) notFound();

  const d = doc as PetDocument;

  async function discard() {
    "use server";
    await deleteDocument(id);
    redirect("/dashboard");
  }

  return (
    <AppShell email={user?.email}>
      <Link href="/dashboard" className="muted text-sm hover:text-brand-600">
        ← Dashboard
      </Link>

      <header className="mb-6 mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">Review the report</h1>
        <p className="muted mt-1 text-sm">
          {d.filename} · {(d.size_bytes / 1024).toFixed(0)} KB
        </p>
      </header>

      {d.status === "failed" && (
        <div className="card p-6 text-center">
          <div className="text-3xl">😕</div>
          <p className="mt-3 font-medium">Couldn&apos;t read that one</p>
          <p className="muted mx-auto mt-1 max-w-md text-sm">
            {d.extraction_error ?? "Something went wrong reading the document."}
          </p>
          <div className="mt-5 flex items-center justify-center gap-4">
            <RetryExtraction documentId={d.id} />
            <form action={discard}>
              <button className="muted text-xs underline underline-offset-4 hover:text-red-600">
                Discard this upload
              </button>
            </form>
          </div>
        </div>
      )}

      {(d.status === "uploaded" || d.status === "extracting") && (
        <div className="card p-6 text-center">
          <div className="text-3xl">⏳</div>
          <p className="mt-3 font-medium">Not read yet</p>
          <p className="muted mt-1 text-sm">
            The upload is stored. Kick off the read when you&apos;re ready.
          </p>
          <div className="mt-5">
            <RetryExtraction documentId={d.id} label="Read this report" />
          </div>
        </div>
      )}

      {d.status === "applied" && (
        <div className="card p-6 text-center">
          <div className="text-3xl">✅</div>
          <p className="mt-3 font-medium">Already saved</p>
          <p className="muted mt-1 text-sm">
            These records are on the pet&apos;s file.
          </p>
          {d.pet_id && (
            <Link
              href={`/pets/${d.pet_id}`}
              className="mt-5 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Open the pet
            </Link>
          )}
        </div>
      )}

      {d.filename.startsWith("SAMPLE") && (
        <div className="card mb-6 border-amber-400 p-4 text-sm">
          <p className="font-medium">🧪 This is a sample report</p>
          <p className="muted mt-1">
            Pre-filled demonstration data, not something read from a document you
            uploaded. Everything below behaves exactly as a real extraction would —
            tick what you want and save it to a pet.
          </p>
        </div>
      )}

      {d.status === "extracted" && d.extracted != null && (
        <ExtractionReview
          documentId={d.id}
          report={d.extracted as ExtractedReport}
          pets={(pets ?? []) as Pet[]}
          presetPetId={d.pet_id}
        />
      )}
    </AppShell>
  );
}
