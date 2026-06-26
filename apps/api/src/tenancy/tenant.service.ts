import { Injectable } from '@nestjs/common';
import { ForbiddenError, type Role, TenantError } from '@vocaliq/shared';
import { clerkClient } from '../auth/clerk';
import type { ClerkClaims } from '../auth/clerk';
import { PrismaService } from '../db/prisma.service';
import type { TenantContext } from './tenant-context';

/**
 * Resolves WHO the caller is (local user) and WHICH tenant scope applies — the
 * auth-infra that legitimately spans tenants, so it uses the owner (`admin`)
 * client. Business data never flows through here; it goes via `withTenant` + RLS.
 */
@Injectable()
export class TenantService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Find or lazily create the local User for a verified Clerk identity (the
   * first-request fallback to the webhook sync). Idempotent on authProviderId.
   */
  async ensureLocalUser(claims: ClerkClaims): Promise<{ id: string }> {
    const existing = await this.db.admin.user.findUnique({
      where: { authProviderId: claims.userId },
      select: { id: true },
    });
    if (existing) return existing;

    const cu = await clerkClient().users.getUser(claims.userId);
    const email =
      cu.primaryEmailAddress?.emailAddress ??
      cu.emailAddresses[0]?.emailAddress ??
      `${claims.userId}@noemail.vocaliq.local`;
    const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ').trim() || null;

    return this.db.admin.user.upsert({
      where: { authProviderId: claims.userId },
      create: { authProviderId: claims.userId, email, name, imageUrl: cu.imageUrl ?? null },
      update: { email, name, imageUrl: cu.imageUrl ?? null },
      select: { id: true },
    });
  }

  /**
   * Resolve the active tenant + role for a local user. Honours the `x-tenant-id`
   * switcher header; defaults to the user's first active membership. Throws if the
   * user has no membership, or is not a member of the requested tenant.
   */
  async resolveContext(localUserId: string, requestedTenantId?: string): Promise<TenantContext> {
    const memberships = await this.db.admin.membership.findMany({
      where: { userId: localUserId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { tenantId: true, role: true },
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
    return { userId: localUserId, tenantId: membership.tenantId, role: membership.role as Role };
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
