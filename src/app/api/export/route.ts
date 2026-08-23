/**
 * GET /api/export            — everything on the account, as JSON.
 * GET /api/export?pet=<id>   — the same, narrowed to one pet.
 *
 * Runs entirely on the caller's own session: RLS decides what comes back, and
 * there is no service-role client anywhere in this path. `?pet=` is not an
 * access decision — an id belonging to somebody else simply returns nothing,
 * because the policy filters it out before this code sees it.
 *
 * The body is streamed. Rows are read in pages and serialised straight into the
 * response, so peak memory is one page rather than one account.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DATASETS,
  PET_DATASETS,
  type AnyClient,
  type Row,
  buildReadme,
  contentDisposition,
  paginate,
  slug,
  todayStamp,
} from "@/lib/export";

// An export must reflect the database at request time, never a cached render.
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

/** Indented two spaces at `depth`, because people do open these files by hand. */
function ind(depth: number): string {
  return "  ".repeat(depth);
}

async function* buildJson(
  supabase: AnyClient,
  email: string | null | undefined,
  petId: string | undefined
): AsyncGenerator<string> {
  let petsArrayOpen = false;
  let failure: string | null = null;

  yield "{\n";
  yield `${ind(1)}"README": ${JSON.stringify(buildReadme(email), null, 2).replace(/\n/g, "\n" + ind(1))},\n`;

  try {
    // Account-level rows. field_definitions is the key to custom_values, so it
    // has to travel with the export or the custom fields become unreadable.
    const defs: Row[] = [];
    for await (const page of paginate(supabase, DATASETS.field_definitions)) {
      defs.push(...page);
    }
    yield `${ind(1)}"account": {\n`;
    yield `${ind(2)}"email": ${JSON.stringify(email ?? null)},\n`;
    yield `${ind(2)}"field_definitions": ${JSON.stringify(defs)}\n`;
    yield `${ind(1)}},\n`;

    yield `${ind(1)}"pets": [`;
    petsArrayOpen = true;

    let petCount = 0;
    for await (const petPage of paginate(supabase, DATASETS.pets, petId)) {
      for (const pet of petPage) {
        // `paginate` can't filter a non-pet-scoped table by pet, so narrow here.
        if (petId && pet.id !== petId) continue;

        yield (petCount === 0 ? "\n" : ",\n") + `${ind(2)}{\n`;
        petCount += 1;

        for (const col of DATASETS.pets.columns) {
          yield `${ind(3)}${JSON.stringify(col)}: ${JSON.stringify(pet[col] ?? null)},\n`;
        }

        yield `${ind(3)}"records": {\n`;
        for (let d = 0; d < PET_DATASETS.length; d++) {
          const name = PET_DATASETS[d];
          yield `${ind(4)}${JSON.stringify(name)}: [`;

          let n = 0;
          for await (const page of paginate(supabase, DATASETS[name], String(pet.id))) {
            for (const row of page) {
              yield (n === 0 ? "\n" : ",\n") + ind(5) + JSON.stringify(row);
              n += 1;
            }
          }
          yield (n === 0 ? "]" : `\n${ind(4)}]`) + (d === PET_DATASETS.length - 1 ? "\n" : ",\n");
        }
        yield `${ind(3)}}\n`;
        yield `${ind(2)}}`;
      }
    }

    yield (petCount === 0 ? "]" : `\n${ind(1)}]`) + ",\n";
    petsArrayOpen = false;
  } catch (err) {
    failure = err instanceof Error ? err.message : "Export failed part-way through.";
    // Headers and the opening brace are long gone, so the only honest thing left
    // is to close the structure and say so in the file itself.
    if (petsArrayOpen) yield `\n${ind(1)}],\n`;
  }

  yield `${ind(1)}"complete": ${failure ? "false" : "true"}`;
  if (failure) yield `,\n${ind(1)}"error": ${JSON.stringify(failure)}`;
  yield "\n}\n";
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const petParam = request.nextUrl.searchParams.get("pet") ?? undefined;

  // Resolved up front only so the download gets the pet's name in its filename.
  // The lookup is RLS-scoped, so an id the caller doesn't own 404s here.
  let namePart = "all-pets";
  if (petParam) {
    const { data: pet } = await supabase
      .from("pets")
      .select("name")
      .eq("id", petParam)
      .maybeSingle();
    if (!pet) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }
    namePart = slug((pet as { name: string }).name, "pet");
  }

  const filename = `furindex-${namePart}-${todayStamp()}.json`;
  const iterator = buildJson(supabase as unknown as AnyClient, user.email, petParam);

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    cancel() {
      // Browser navigated away mid-download; stop paging the database.
      void iterator.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": contentDisposition(filename),
      "cache-control": "no-store, private",
    },
  });
}
