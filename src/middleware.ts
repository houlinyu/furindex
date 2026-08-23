import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Prefix-matched. "/" is handled separately below — as a prefix it would make
// every route public.
const PUBLIC_PREFIXES = ["/login", "/auth"];
const PUBLIC_EXACT = ["/", "/collaborate", "/partners", "/science", "/compare"];

/**
 * Refreshes the Supabase auth cookie on every request and bounces signed-out
 * visitors to /login. Server Components cannot write cookies, so this is the
 * only place the refreshed session token actually gets persisted.
 */
export async function middleware(request: NextRequest) {
  // Optional shared-password gate for test deploys. Unset in local dev and in
  // production, this is a no-op — the app's own auth is the real access control.
  // Set SITE_PASSWORD in Vercel to keep a preview deploy off the open internet.
  const gate = process.env.SITE_PASSWORD;
  if (gate) {
    const provided = request.cookies.get("site_gate")?.value;
    const viaQuery = request.nextUrl.searchParams.get("k");

    if (viaQuery === gate) {
      const url = request.nextUrl.clone();
      url.searchParams.delete("k");
      const res = NextResponse.redirect(url);
      res.cookies.set("site_gate", gate, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        maxAge: 60 * 60 * 24 * 30,
      });
      return res;
    }
    if (provided !== gate) {
      return new NextResponse(
        "<!doctype html><meta name=viewport content='width=device-width'>" +
          "<div style=\"font:16px system-ui;max-width:32rem;margin:20vh auto;padding:0 1.5rem;text-align:center\">" +
          "<div style=font-size:2rem>🐾</div>" +
          "<h1 style=\"font-size:1.1rem;margin:.75rem 0\">FurIndex — private preview</h1>" +
          "<p style=color:#666>This build is shared with the team only. Open the link you were given, including its <code>?k=</code> part.</p></div>",
        { status: 401, headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() revalidates against the auth server — do not swap for getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Segment-boundary match, not a bare startsWith — otherwise a future route
  // called /login-admin or /authorize would silently become public.
  const isPublic =
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
