import { TenantError } from '@vocaliq/shared';
import type { NextFunction, Request, Response } from 'express';
import type { TenantService } from '../tenancy/tenant.service';

/**
 * Resolve + attach the active tenant scope (`req.ctx`). Runs AFTER authMiddleware. With
 * self-hosted JWT the token subject IS the local User.id, so we resolve the membership
 * directly — no external identity lookup. Honours the `x-tenant-id` switcher header.
 * Replaces Nest's TenantGuard. Factory takes the TenantService (composition root wires it).
 */
export function tenantMiddleware(tenants: TenantService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw new TenantError('Authentication required before tenant resolution');
      // A super-admin impersonation grant (Day 55): the signed `act` claim scopes the request to
      // the target tenant. resolveImpersonation re-verifies the actor is still a SUPER_ADMIN, so a
      // demoted operator's grant fails closed. Otherwise the normal membership path applies.
      if (req.auth.actAsTenantId) {
        req.ctx = await tenants.resolveImpersonation(req.auth.userId, req.auth.actAsTenantId);
        next();
        return;
      }
      const requested = req.headers['x-tenant-id'] as string | undefined;
      req.ctx = await tenants.resolveContext(req.auth.userId, requested);
      next();
    } catch (err) {
      next(err);
    }
  };
}
