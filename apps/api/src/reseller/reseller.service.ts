import { randomBytes } from 'node:crypto';
import {
  ForbiddenError,
  MembershipStatus,
  NotFoundError,
  Role,
  type SubTenantInput,
  TenantType,
  ValidationError,
  descendantIds,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Reseller provisioning (Day 51). A reseller creates/suspends/manages its OWN sub-tenants with
 * no platform involvement. Every READ + MANAGE path (list/get/setStatus) runs under
 * `withTenant(resellerId)`, so RLS (`is_in_subtree`) guarantees a reseller can only ever touch
 * its own subtree — never a sibling reseller's (self-audit B, the critical property, proven by
 * the isolation tests). Only tenant CREATION uses the admin client (an inherently privileged op,
 * like signup — RLS `WITH CHECK` can't self-reference a not-yet-visible new row), with the
 * parent HARD-SET to the caller's reseller after `assertReseller`.
 */

export interface SubTenantRow {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  parentTenantId: string | null;
  createdAt: Date;
}

function slugify(base: string): string {
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'workspace'
  );
}

export class ResellerService {
  constructor(private readonly db: PrismaService) {}

  /** The caller must own a RESELLER (or PLATFORM) tenant to provision sub-tenants. */
  private async assertReseller(resellerId: string): Promise<void> {
    const t = await this.db.admin.tenant.findUnique({
      where: { id: resellerId },
      select: { type: true },
    });
    if (!t) throw new NotFoundError('Tenant not found');
    if (t.type !== TenantType.RESELLER && t.type !== TenantType.PLATFORM) {
      throw new ForbiddenError('Only a reseller can provision sub-tenants');
    }
  }

  private async uniqueSlug(desired: string): Promise<string> {
    let slug = slugify(desired);
    // Slug is globally unique; append a short suffix on collision.
    for (let i = 0; i < 5; i++) {
      const clash = await this.db.admin.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!clash) return slug;
      slug = `${slugify(desired)}-${randomBytes(2).toString('hex')}`;
    }
    return `${slugify(desired)}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * Provision a new sub-tenant under the reseller with an OWNER user. Creating a tenant is an
   * inherently privileged operation (like signup) — RLS `WITH CHECK` can't self-reference a
   * not-yet-visible new row to prove its ancestry — so the tenant + membership are created via
   * the admin client with `parentTenantId` HARD-SET to the caller's reseller (application-layer
   * guard, after `assertReseller`). All later read/manage paths run under RLS, so isolation is
   * still DB-enforced everywhere it can be (self-audit B). The owner user is reused by email.
   */
  async createSubTenant(resellerId: string, input: SubTenantInput): Promise<SubTenantRow> {
    await this.assertReseller(resellerId);
    const slug = await this.uniqueSlug(input.slug ?? input.name);

    const owner =
      (await this.db.admin.user.findUnique({
        where: { email: input.ownerEmail },
        select: { id: true },
      })) ??
      (await this.db.admin.user.create({
        data: { email: input.ownerEmail, name: input.ownerName ?? null },
        select: { id: true },
      }));

    return this.db.admin.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          type: TenantType.CUSTOMER,
          name: input.name,
          slug,
          status: input.status,
          parentTenantId: resellerId, // isolation: always a child of THIS reseller
        },
        select: SELECT,
      });
      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          role: Role.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });
      return tenant;
    });
  }

  /** Direct sub-tenants of this reseller (RLS-scoped — never a sibling reseller's). */
  async listSubTenants(resellerId: string): Promise<SubTenantRow[]> {
    return this.db.withTenant(resellerId, (tx) =>
      tx.tenant.findMany({
        where: { parentTenantId: resellerId },
        orderBy: { createdAt: 'desc' },
        select: SELECT,
      }),
    );
  }

  async getSubTenant(resellerId: string, id: string): Promise<SubTenantRow> {
    if (id === resellerId) throw new ValidationError('That is the reseller itself');
    const t = await this.db.withTenant(resellerId, (tx) =>
      tx.tenant.findFirst({ where: { id }, select: SELECT }),
    );
    if (!t) throw new NotFoundError('Sub-tenant not found'); // RLS hides other resellers' tenants
    return t;
  }

  /**
   * Suspend or reactivate a sub-tenant AND its whole subtree (cascade). Guards: cannot target
   * the reseller itself, and the target must be inside the reseller's subtree (RLS-verified via
   * the subtree read — a sibling reseller's tenant simply isn't visible → NotFound).
   */
  async setStatus(
    resellerId: string,
    id: string,
    status: 'SUSPENDED' | 'ACTIVE',
  ): Promise<{ affected: number; status: string }> {
    if (id === resellerId)
      throw new ValidationError('A reseller cannot change its own status here');

    return this.db.withTenant(resellerId, async (tx) => {
      // The reseller's entire visible subtree (reseller + descendants), scoped by RLS.
      const subtree = await tx.tenant.findMany({ select: { id: true, parentTenantId: true } });
      if (!subtree.some((t) => t.id === id)) {
        throw new NotFoundError('Sub-tenant not found'); // outside this reseller's subtree
      }
      const ids = descendantIds(subtree, id); // target + all its descendants
      const res = await tx.tenant.updateMany({ where: { id: { in: ids } }, data: { status } });
      return { affected: res.count, status };
    });
  }
}

const SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  status: true,
  parentTenantId: true,
  createdAt: true,
} as const;
