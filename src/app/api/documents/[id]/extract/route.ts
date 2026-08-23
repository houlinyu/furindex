import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractReport, isSupportedMime } from "@/lib/extraction";

// Reading a multi-page PDF can take a while; the default 15s would cut it off.
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // RLS scopes this to the caller's own documents — a foreign id returns null,
  // not someone else's row.
  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (!isSupportedMime(doc.mime_type)) {
    return NextResponse.json({ error: `Unsupported file type: ${doc.mime_type}` }, { status: 400 });
  }
  // No 409 on status === "extracting". A timeout, redeploy or crash between the
  // status write and the result leaves the row stuck in that state forever, and
  // a 409 would make the retry button permanently useless. The work is
  // idempotent — re-reading just overwrites `extracted`.

  await supabase.from("documents").update({ status: "extracting" }).eq("id", id);

  try {
    const { data: file, error: dlError } = await supabase.storage
      .from("vet-reports")
      .download(doc.storage_path);

    if (dlError || !file) {
      throw new Error(dlError?.message ?? "Could not read the uploaded file back");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Separate query rather than a FK embed — the hand-written Database type
    // carries no relationship metadata for PostgREST to resolve.
    let petName: string | null = null;
    if (doc.pet_id) {
      const { data: pet } = await supabase
        .from("pets")
        .select("name")
        .eq("id", doc.pet_id)
        .maybeSingle();
      petName = pet?.name ?? null;
    }
    const extracted = await extractReport(bytes, doc.mime_type, petName);

    await supabase
      .from("documents")
      .update({ status: "extracted", extracted, extraction_error: null })
      .eq("id", id);

    return NextResponse.json({ ok: true, extracted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    await supabase
      .from("documents")
      .update({ status: "failed", extraction_error: message })
      .eq("id", id);
    // The message is our own or the SDK's — safe to surface, and the user needs
    // to know whether to retry or re-photograph.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
