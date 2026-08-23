import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scanPetPhoto, scanProvider } from "@/lib/breed-scan";

export const maxDuration = 30;

const MAX_BYTES = 4.5 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"] as const;
const HOURLY_LIMIT = 5;

/** Hashed with a server-side salt: enough to rate limit, not enough to identify. */
function hashIp(req: NextRequest): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const salt = process.env.SCAN_IP_SALT ?? "furindex-default-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function POST(request: NextRequest) {
  if (!scanProvider()) {
    return NextResponse.json(
      { error: "Photo scanning isn't switched on for this deployment yet.", disabled: true },
      { status: 503 }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo received." }, { status: 400 });
  }
  if (!(ALLOWED as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "Upload a PNG, JPG or WebP." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That photo is over 4.5 MB." }, { status: 413 });
  }

  // Rate limit BEFORE doing any paid work.
  const supabase = await createClient();
  const { data: allowed, error: rlError } = await supabase.rpc("claim_scan_slot", {
    p_ip_hash: hashIp(request),
    p_limit: HOURLY_LIMIT,
  });
  if (rlError) {
    console.error("rate limit check failed", rlError);
    return NextResponse.json({ error: "Try again in a moment." }, { status: 503 });
  }
  if (allowed === false) {
    return NextResponse.json(
      {
        error: `That's ${HOURLY_LIMIT} scans this hour — the limit for guests. Create a free account to keep going.`,
        rateLimited: true,
      },
      { status: 429 }
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await scanPetPhoto(bytes, file.type as (typeof ALLOWED)[number]);
    // The photo is never written anywhere. It exists in memory for this request
    // and nowhere else — a stranger's pet photo is not ours to keep.
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("breed scan failed", err);
    return NextResponse.json(
      { error: "Couldn't read that one. A clearer, closer photo usually works." },
      { status: 500 }
    );
  }
}
