import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Express request augmentation for the self-hosted stack (replaces Nest's guard-set
 * `req.auth`/`req.tenant`). `authMiddleware` sets `req.auth`; `tenantMiddleware` sets
 * `req.ctx`. Declared globally so every route handler sees the typed fields on `Request`.
 */

/** Verified session claims (our own JWT; `userId` is the LOCAL User.id). */
export interface AuthClaims {
  userId: string;
  /** Set only on a super-admin impersonation grant — the tenant being acted upon (Day 55). */
  actAsTenantId?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
      ctx?: TenantContext;
      /** Granted scopes when the request is authenticated by an API key (Day 48). */
      apiScopes?: string[];
    }
  }
}

/** Alias kept for middleware signatures; the fields live on the standard Request now. */
export type AppRequest = Express.Request;
