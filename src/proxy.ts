import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cv_session";

/**
 * Marks a /login redirect that came from a rejected (stale) session rather
 * than from an anonymous visitor, so the proxy knows not to bounce it back.
 * Kept in sync with `requireUser()` in src/lib/auth/session.ts.
 */
const EXPIRED_PARAM = "expired";

/**
 * Fast redirect for the admin area.
 *
 * This is UX only: it keeps anonymous visitors from ever rendering the admin
 * shell. It deliberately checks for the *presence* of a session cookie rather
 * than validating it, because Proxy should not share modules with the app.
 * Real authorisation happens in `requireUser()` inside the admin layout, in
 * every Server Action, and in the document route handler.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  const isProtected = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isProtected && !hasSession) {
    const url = new URL("/login", request.url);
    if (pathname !== "/admin") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // A valid session visiting /login is sent straight to /admin. The check is
  // cookie *presence* only — the proxy must not share app modules — so a
  // stale cookie would bounce forever (/admin → /login → /admin → …).
  // `requireUser()` therefore marks its own redirects with `?expired=1`, and
  // we never bounce on that marker: the login page renders and the owner
  // signs in again, which overwrites the stale cookie.
  if (
    (pathname === "/login" || pathname === "/setup") &&
    hasSession &&
    !request.nextUrl.searchParams.has(EXPIRED_PARAM)
  ) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/login", "/setup"],
};
