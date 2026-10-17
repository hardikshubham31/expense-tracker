import { NextResponse, type NextRequest } from "next/server";

// Signed-in users skip these. /reset-password stays reachable: Google users set a password through it.
const AUTH_PAGES = ["/login", "/signup", "/forgot-password"];

// Optimistic check on the cookie only. Pages still verify the session on the server.
export function proxy(request: NextRequest) {
  // The API sets this httpOnly cookie on sign-in (see apps/api/src/auth/sessions.ts)
  const hasSession = request.cookies.has("session");
  const { pathname, search } = request.nextUrl;

  if (!hasSession && (pathname.startsWith("/dashboard") || pathname.startsWith("/invite/"))) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirectTo", pathname + search);
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/invite/:path*", "/login", "/signup", "/forgot-password"],
};
