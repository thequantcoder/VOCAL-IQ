import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { TenantError } from '@vocaliq/shared';
import type { ClerkClaims } from './clerk';
import type { AuthedRequest } from './clerk-auth.guard';

/**
 * `@CurrentUser()` — yields the verified Clerk claims set by ClerkAuthGuard.
 * Throws if used on a route that wasn't guarded (programmer error, fail loud).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClerkClaims => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth) throw new TenantError('Route is not authenticated');
    return req.auth;
  },
);
