import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, type Role, TenantError } from '@vocaliq/shared';
import { ROLES_KEY, hasRequiredRole } from './roles';
import type { TenantedRequest } from './tenant-context';

/**
 * Enforces the role matrix (deny-by-default). Runs AFTER TenantGuard, which
 * resolves the caller's role for the active tenant. SUPER_ADMIN always passes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<TenantedRequest>();
    const role = req.tenant?.role;
    if (!role) throw new TenantError('Tenant role not resolved (TenantGuard must run first)');
    if (!hasRequiredRole(role, required)) {
      throw new ForbiddenError('Your role cannot perform this action');
    }
    return true;
  }
}
