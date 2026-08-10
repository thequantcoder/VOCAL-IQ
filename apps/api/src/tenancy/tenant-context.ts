import type { Role } from '@vocaliq/shared';

/** The resolved tenant scope for a request (set by tenantMiddleware). */
export interface TenantContext {
  /** Local User.id. */
  userId: string;
  tenantId: string;
  role: Role;
  /** The membership row id for (userId, tenantId) — used by the Agent Desk (Day 67). */
  membershipId: string;
}
