import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { TenantError } from '@vocaliq/shared';
import type { TenantedRequest } from './tenant-context';
import { TenantService } from './tenant.service';

/**
 * Resolves + attaches the active tenant scope. Runs AFTER ClerkAuthGuard (needs the
 * verified user). Honours the `x-tenant-id` switcher header. The resolved context
 * feeds `@CurrentTenant()`, RolesGuard, and `withTenant()` — the front-door filter
 * that complements the RLS safety net (CODE-PATTERNS §1).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenants: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantedRequest>();
    if (!req.auth) throw new TenantError('Authentication required before tenant resolution');

    const user = await this.tenants.ensureLocalUser(req.auth);
    const requested = req.headers['x-tenant-id'] as string | undefined;
    req.tenant = await this.tenants.resolveContext(user.id, requested);
    return true;
  }
}
