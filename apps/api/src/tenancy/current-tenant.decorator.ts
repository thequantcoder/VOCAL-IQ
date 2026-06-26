import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { TenantError } from '@vocaliq/shared';
import type { TenantContext, TenantedRequest } from './tenant-context';

/** `@CurrentTenant()` → the active tenant id (set by TenantGuard). */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<TenantedRequest>();
    if (!req.tenant) throw new TenantError('No tenant context (route must use TenantGuard)');
    return req.tenant.tenantId;
  },
);

/** `@CurrentMembership()` → the full resolved context (userId, tenantId, role). */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<TenantedRequest>();
    if (!req.tenant) throw new TenantError('No tenant context (route must use TenantGuard)');
    return req.tenant;
  },
);
