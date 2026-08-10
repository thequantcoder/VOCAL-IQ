import { ForbiddenError, NotFoundError, Role, TenantError } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { TenantContext } from './tenant-context';

/**
 * Resolves WHO the caller is (local user) and WHICH tenant scope applies — the
 * auth-infra that legitimately spans tenants, so it uses the owner (`admin`)
 * client. Business data never flows through here; it goes via `withTenant` + RLS.
 */
export class TenantService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Resolve the active tenant + role for a local user. Honours the `x-tenant-id`
   * switcher header; defaults to the user's first active membership. Throws if the
   * user has no membership, or is not a member of the requested tenant.
   */
  async resolveContext(localUserId: string, requestedTenantId?: string): Promise<TenantContext> {
    const memberships = await this.db.admin.membership.findMany({
      where: { userId: localUserId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, tenantId: true, role: true },
    });
    if (memberships.length === 0) {
      throw new TenantError('User has no active tenant membership');
    }
    const firstMembership = memberships[0];
    const targetId = requestedTenantId ?? firstMembership?.tenantId;
    const membership = memberships.find((m) => m.tenantId === targetId);
    if (!membership) {
      throw new ForbiddenError('Not a member of the requested tenant');
    }
    return {
      userId: localUserId,
      tenantId: membership.tenantId,
      role: membership.role as Role,
      membershipId: membership.id,
    };
  }

  /**
   * Resolve the scope for a super-admin IMPERSONATION grant (Day 55). The actor MUST currently
   * hold a SUPER_ADMIN membership (re-checked here on every request — a demoted admin's grant
   * stops working immediately) and the target tenant must exist. The returned context is
   * attributed to the ACTOR with the SUPER_ADMIN role, so downstream RBAC + audit see the real
   * operator. This is the ONLY cross-tenant scope path outside a user's own memberships.
   */
  async resolveImpersonation(actorUserId: string, targetTenantId: string): Promise<TenantContext> {
    const isSuperAdmin = await this.db.admin.membership.findFirst({
      where: { userId: actorUserId, role: Role.SUPER_ADMIN, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!isSuperAdmin) {
      throw new ForbiddenError('Impersonation requires an active super-admin');
    }
    const target = await this.db.admin.tenant.findUnique({
      where: { id: targetTenantId },
      select: { id: true },
    });
    if (!target) throw new NotFoundError('Tenant not found');
    // The impersonating super-admin has no membership in the target tenant; membershipId is empty
    // (the Agent Desk isn't used while impersonating).
    return {
      userId: actorUserId,
      tenantId: targetTenantId,
      role: Role.SUPER_ADMIN,
      membershipId: '',
    };
  }

  /** The tenants a user can switch between (for the tenant switcher UI). */
  listMemberships(
    localUserId: string,
  ): Promise<{ tenantId: string; role: string; status: string }[]> {
    return this.db.admin.membership.findMany({
      where: { userId: localUserId },
      select: { tenantId: true, role: true, status: true },
    });
  }
}
