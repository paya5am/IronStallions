// Runs before every portal page: no session cookie -> go to the login page.
// The API layer still checks the session and role on every request.
import { NextResponse } from 'next/server';

const COOKIE = process.env.SESSION_COOKIE_NAME || 'gym_session';

export function proxy(request) {
  if (!request.cookies.get(COOKIE)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/member/:path*', '/trainer/:path*', '/staff/:path*', '/admin/:path*'],
};
