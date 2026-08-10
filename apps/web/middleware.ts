import { type NextRequest, NextResponse } from 'next/server';

/**
 * Self-hosted route protection (replaces Clerk middleware). Everything under /dashboard
 * requires the `vq_token` session cookie; unauthenticated hits redirect to /sign-in
 * (deny-by-default for app surfaces, CODING-RULES §6). The JWT itself is verified by the
 * API on every request — this is just the cheap edge gate for the UI.
 */
export function middleware(req: NextRequest) {
  const token = req.cookies.get('vq_token')?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
