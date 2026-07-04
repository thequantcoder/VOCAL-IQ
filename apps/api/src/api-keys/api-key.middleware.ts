import {
  type ApiScope,
  AuthError,
  ForbiddenError,
  RateLimitError,
  hasScope,
} from '@vocaliq/shared';
import type { Role } from '@vocaliq/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { RateLimiter } from '../widget/rate-limiter';
import type { ApiKeyService } from './api-key.service';

/**
 * Public-API auth (Day 48). Authenticates the `Authorization: Bearer <key>` (or `X-Api-Key`)
 * against the ApiKeyService, enforces the key's per-minute rate limit (in-memory fixed window,
 * one node — Redis at scale), meters the request, and attaches `req.ctx` scoped to the key's
 * tenant so downstream handlers run RLS-scoped exactly like a session request (self-audit C+B+D).
 */
export function apiKeyAuth(keys: ApiKeyService): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw =
        (req.headers['x-api-key'] as string | undefined) ??
        req.headers.authorization?.replace(/^Bearer\s+/i, '');
      const auth = await keys.authenticate(raw);
      if (!auth) throw new AuthError('Invalid or missing API key');

      // Per-key rate limit: a dedicated bucket sized to the key's rateLimitPerMin.
      const bucket = perKeyLimiter(auth.keyId, auth.rateLimitPerMin);
      if (!bucket.hit(auth.keyId)) throw new RateLimitError('Rate limit exceeded');

      // Scope the request to the key's tenant (RLS via the same ctx a session sets).
      req.ctx = { userId: auth.keyId, tenantId: auth.tenantId, role: 'ADMIN' as Role };
      req.apiScopes = auth.scopes;

      void keys.meter(auth.keyId); // fire-and-forget usage metering
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Per-key limiters, created lazily and sized to each key's rate.
const limiters = new Map<string, RateLimiter>();
function perKeyLimiter(keyId: string, perMin: number): RateLimiter {
  const existing = limiters.get(keyId);
  if (existing) return existing;
  const l = new RateLimiter(perMin, 60_000);
  limiters.set(keyId, l);
  return l;
}

/** Require an API scope on a public-API route (deny-by-default). */
export function requireScope(scope: ApiScope): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!hasScope(req.apiScopes ?? [], scope)) {
      next(new ForbiddenError(`This API key is missing the "${scope}" scope`));
      return;
    }
    next();
  };
}
