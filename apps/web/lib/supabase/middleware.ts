import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight auth gate run from the Next.js proxy (middleware).
 *
 * Previously this called `supabase.auth.getUser()` on every request, which
 * RPCs to the Supabase Auth API to validate the session — that added ~400-
 * 600ms of latency to every page load and API call (proxy.ts: 440-570ms in
 * dev logs), even when the page/API handler was about to call `getUser()`
 * again itself. The duplicated round-trip is the single biggest source of
 * runtime slowness in the app.
 *
 * The middleware now does a cheap cookie-presence check to decide whether
 * to redirect anonymous users to /login. Real authentication is enforced by
 * each page (server components calling `createClient().auth.getUser()`) and
 * each API route (same pattern). Token refresh also happens there — when a
 * handler calls getUser() with an expired access token, `@supabase/ssr`
 * uses the refresh token to mint a new one and writes the rotated cookies
 * back via the `setAll` cookie handler.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const isPublic =
    path === "/" ||
    path === "/login" ||
    path.startsWith("/auth") ||
    path.startsWith("/_next") ||
    path.startsWith("/favicon");
  if (isPublic) return NextResponse.next();

  // Supabase auth cookies are stored as `sb-<ref>-auth-token` (sometimes
  // chunked into `.0`, `.1`, …). Their presence is enough to gate the UI;
  // forged cookies fail at the page/API handler's getUser() call.
  const hasAuth = request.cookies
    .getAll()
    .some((c) => /^sb-.+-auth-token(?:\.\d+)?$/.test(c.name));

  if (!hasAuth) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
