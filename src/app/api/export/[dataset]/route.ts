/**
 * GET /api/export/<record type>          — one CSV per record type.
 * GET /api/export/<record type>?pet=<id> — the same, narrowed to one pet.
 *
 * Same rules as the JSON export: the caller's own session, RLS as the only
 * access control, and the rows streamed a page at a time rather than gathered
 * into an array first.
 *
 * The CSVs are deliberately a little wider than the underlying table. A file of
 * `pet_id` UUIDs is technically complete and practically useless, so pet-scoped
 * exports carry `pet_name`, and custom_values carries the label and unit of the
 * field it belongs to. Portability means someone can read it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DATASETS,
  DATASET_NAMES,
  type AnyClient,
  type Row,
  contentDisposition,
  csvRow,
  paginate,
  slug,
  todayStamp,
} from "@/lib/export";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset: name } = await params;
  const dataset = DATASETS[name];
  if (!dataset) {
    return NextResponse.json(
      { error: `Unknown record type "${name}".`, available: DATASET_NAMES },
      { status: 404 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const petParam = request.nextUrl.searchParams.get("pet") ?? undefined;

  // Every pet the caller owns, for the pet_name column and the filename. RLS
  // scopes it, and an owner has a handful of pets — this one is small enough to
  // hold whole. Nothing else in this handler is.
  const { data: petRows } = await supabase.from("pets").select("id,name");
  const petNames = new Map(
    ((petRows ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );

  if (petParam && !petNames.has(petParam)) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }

  // Labels for custom_values. Also small, also account-scoped.
  let defs = new Map<string, { label: string; unit: string | null }>();
  if (name === "custom_values") {
    const { data } = await supabase.from("field_definitions").select("id,label,unit");
    defs = new Map(
      ((data ?? []) as { id: string; label: string; unit: string | null }[]).map((d) => [
        d.id,
        { label: d.label, unit: d.unit },
      ])
    );
  }

  const extra: string[] = [];
  if (dataset.petScoped) extra.push("pet_name");
  if (name === "custom_values") extra.push("field_label", "field_unit");
  const header = [...dataset.columns, ...extra];

  const decorate = (row: Row): unknown[] => {
    const cells: unknown[] = dataset.columns.map((c) => row[c]);
    if (dataset.petScoped) cells.push(petNames.get(String(row.pet_id)) ?? "");
    if (name === "custom_values") {
      const d = defs.get(String(row.definition_id));
      cells.push(d?.label ?? "", d?.unit ?? "");
    }
    return cells;
  };

  const scope = petParam ? slug(petNames.get(petParam) ?? "pet", "pet") : "all-pets";
  const filename = `furindex-${scope}-${name.replace(/_/g, "-")}-${todayStamp()}.csv`;

  async function* body(): AsyncGenerator<string> {
    // UTF-8 BOM: without it Excel on Windows reads the file as the local
    // codepage and mangles every accented pet name.
    yield "﻿" + csvRow(header);
    try {
      for await (const page of paginate(supabase as unknown as AnyClient, dataset, petParam)) {
        // One string per page rather than per row — far fewer stream writes.
        yield page.map((row) => csvRow(decorate(row))).join("");
      }
    } catch (err) {
      // The status line is already sent. A trailing comment row is the only way
      // left to tell the reader the file is short, and it beats silence.
      const message = err instanceof Error ? err.message : "unknown error";
      yield csvRow([`# EXPORT INCOMPLETE — ${message}`]);
    }
  }

  const iterator = body();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    cancel() {
      void iterator.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": contentDisposition(filename),
      "cache-control": "no-store, private",
    },
  });
}
