import type { Request } from 'express';
import type { TenantContext } from '../tenancy/tenant-context';

/**
 * Express request augmentation for the self-hosted stack (replaces Nest's guard-set
 * `req.auth`/`req.tenant`). `authMiddleware` sets `auth`; `tenantMiddleware` sets `ctx`.
 */

/** Verified session claims (our own JWT; `userId` is the LOCAL User.id). */
export interface AuthClaims {
  userId: string;
}

/** Request carrying the verified auth + resolved tenant scope. */
export interface AppRequest extends Request {
  auth?: AuthClaims;
  ctx?: TenantContext;
}
