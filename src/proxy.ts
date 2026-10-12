import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cv_session";

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

  // Deliberately no "cookie present on /login → /admin" bounce. The proxy can
  // only see that a cookie exists, not whether it is still valid, so bouncing
  // here would loop forever against a stale cookie: the admin layout rejects
  // it → /login → back to /admin → … . The login page performs the real
  // "already signed in?" check itself with `getSessionUser()`.
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/login", "/setup"],
};
