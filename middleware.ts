import { NextRequest, NextResponse } from "next/server";

/*
  Lightweight middleware — just redirects unauthenticated requests away from
  protected routes. The real auth check (role verification, session expiry)
  happens in the Server Component via requireAuth().

  We check for the cookie here so that the login page itself doesn't
  need the cookie, and static assets pass through untouched.
*/

const PUBLIC = ["/login", "/_next", "/favicon.ico"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("stars_session")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
