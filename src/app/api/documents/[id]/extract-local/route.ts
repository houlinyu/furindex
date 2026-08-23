import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupportedMime } from "@/lib/extraction";
import { localExtractProvider, scanReportLocal } from "@/lib/extraction-local";

/**
 * The no-key reader. Same contract as ../extract, and deliberately separate
 * from it: this one costs nothing per call, needs nothing configured, and is
 * honest about being weaker. The client falls back to it when the model-backed
 * route reports that it has no API key.
 */

// OCR of a full-page photograph takes a few seconds on a cold function.
export const maxDuration = 60;
// tesseract.js and pdf.js both need Node, not the edge runtime.
export const runtime = "nodejs";

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
  if (!localExtractProvider()) {
    return NextResponse.json(
      { error: "On-device reading is switched off.", disabled: true },
      { status: 503 }
    );
  }

  const { data: doc } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  // Reading rights are not enough: this returns the document's contents.
  if (doc.owner_id !== user.id) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (!isSupportedMime(doc.mime_type)) {
    return NextResponse.json({ error: `Unsupported file type: ${doc.mime_type}` }, { status: 400 });
  }

  await supabase.from("documents").update({ status: "extracting" }).eq("id", id);

  try {
    const { data: file, error: dlError } = await supabase.storage
      .from("vet-reports")
      .download(doc.storage_path);
    if (dlError || !file) {
      throw new Error(dlError?.message ?? "Could not read the uploaded file back");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await scanReportLocal(bytes, doc.mime_type);

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
