import type { NextFunction, Request, Response } from 'express';

/**
 * Security headers + CORS (Day 64) — dependency-free hardening applied to every response before
 * the routes. Sets the standard defensive headers (HSTS, nosniff, frame-deny, referrer +
 * permissions policy, a strict API CSP) and enforces a CORS allow-list from env. No third-party
 * middleware, so nothing new to audit (self-audit C). The API serves JSON only, so the CSP is
 * maximally strict (`default-src 'none'`).
 */

/** Attach defensive security headers to every response. */
export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    // Force HTTPS for a year (incl. subdomains) — terminated at the proxy in prod.
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // No MIME sniffing; no framing (clickjacking); minimal refer/leakage.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    // The API returns JSON only — lock the CSP right down.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    // Drop powerful browser features the API never needs.
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    next();
  };
}

/** Parse the CORS allow-list from env (comma-separated origins). Empty → same-origin only. */
export function parseCorsAllowlist(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * CORS enforcement against an allow-list. An Origin not on the list gets no CORS headers (the
 * browser then blocks the cross-origin read) — we never reflect an arbitrary Origin. Handles the
 * preflight `OPTIONS` request.
 */
export function corsMiddleware(allowlist: string[]) {
  const allowed = new Set(allowlist);
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-tenant-id');
    }
    if (req.method === 'OPTIONS') {
      // Preflight: 204 whether or not the origin was allowed (no body either way).
      res.status(204).end();
      return;
    }
    next();
  };
}
