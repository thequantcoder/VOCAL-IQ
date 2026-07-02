import type { Role } from '@vocaliq/shared';

/** The resolved tenant scope for a request (set by tenantMiddleware). */
export interface TenantContext {
  /** Local User.id. */
  userId: string;
  tenantId: string;
  role: Role;
}
