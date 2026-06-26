import type { Role } from '@vocaliq/shared';
import type { AuthedRequest } from '../auth/clerk-auth.guard';

/** The resolved tenant scope for a request (set by TenantGuard). */
export interface TenantContext {
  /** Local User.id (not the Clerk id). */
  userId: string;
  tenantId: string;
  role: Role;
}

/** Request carrying both the verified auth and the resolved tenant context. */
export interface TenantedRequest extends AuthedRequest {
  tenant?: TenantContext;
}
