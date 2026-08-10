import { ForbiddenError, type Role, TenantError } from '@vocaliq/shared';
import type { NextFunction, Request, Response } from 'express';
import { hasRequiredRole } from '../tenancy/roles';

/**
 * Restrict a route to specific tenant roles (deny-by-default). Runs AFTER tenantMiddleware,
 * which resolves `req.ctx.role`. SUPER_ADMIN always passes (see `hasRequiredRole`). No roles
 * listed = any authenticated member. Replaces Nest's RolesGuard + `@Roles()` decorator.
 */
export function requireRoles(...required: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.ctx?.role;
    if (!role) {
      next(new TenantError('Tenant role not resolved (tenantMiddleware must run first)'));
      return;
    }
    if (!hasRequiredRole(role, required)) {
      next(new ForbiddenError('Your role cannot perform this action'));
      return;
    }
    next();
  };
}
