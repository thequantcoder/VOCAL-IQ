import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Express request augmentation for the self-hosted stack (replaces Nest's guard-set
 * `req.auth`/`req.tenant`). `authMiddleware` sets `req.auth`; `tenantMiddleware` sets
 * `req.ctx`. Declared globally so every route handler sees the typed fields on `Request`.
 */

/** Verified session claims (our own JWT; `userId` is the LOCAL User.id). */
export interface AuthClaims {
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
      ctx?: TenantContext;
    }
  }
}

/** Alias kept for middleware signatures; the fields live on the standard Request now. */
export type AppRequest = Express.Request;
