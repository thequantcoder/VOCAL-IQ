import type { Prisma } from '@vocaliq/db';
import {
  type FlagEntry,
  type FlagValue,
  ForbiddenError,
  Role,
  ValidationError,
  flagInputSchema,
  isFlagEnabled,
  resolveAllFlags,
  resolveFlag,
} from '@vocaliq/shared';
import type { EntitlementsService } from '../billing/entitlements.service';
import type { PrismaService } from '../db/prisma.service';

/**
 * Feature flags + entitlement gating (Day 58). Flags resolve with strict precedence
 * TENANT > PLAN > GLOBAL (pure logic in @vocaliq/shared). GLOBAL + TENANT flags live in the
 * `FeatureFlag` table; PLAN flags are sourced from the tenant's active plan's `features` (no
 * duplication — the plan builder already owns them). Writes are admin-scoped + audited: GLOBAL is
 * SUPER_ADMIN-only, a TENANT flag is the caller's own tenant.
 */

export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface FlagDto {
  scope: 'GLOBAL' | 'PLAN' | 'TENANT';
  key: string;
  value: FlagValue;
}

export class FeatureFlagsService {
  constructor(
    private readonly db: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** GLOBAL flags (platform catalog). */
  async listGlobal(): Promise<FlagDto[]> {
    const rows = await this.db.admin.featureFlag.findMany({
      where: { scope: 'GLOBAL' },
      select: { scope: true, key: true, value: true },
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({ scope: r.scope, key: r.key, value: r.value as FlagValue }));
  }

  /** A tenant's own TENANT-scope overrides. */
  async listTenant(tenantId: string): Promise<FlagDto[]> {
    const rows = await this.db.admin.featureFlag.findMany({
      where: { scope: 'TENANT', tenantId },
      select: { scope: true, key: true, value: true },
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({ scope: r.scope, key: r.key, value: r.value as FlagValue }));
  }

  /** All entries in effect for a tenant (GLOBAL + PLAN-from-plan-features + TENANT). */
  private async entriesFor(tenantId: string): Promise<FlagEntry[]> {
    const [globals, tenantRows, ent] = await Promise.all([
      this.db.admin.featureFlag.findMany({
        where: { scope: 'GLOBAL' },
        select: { key: true, value: true },
      }),
      this.db.admin.featureFlag.findMany({
        where: { scope: 'TENANT', tenantId },
        select: { key: true, value: true },
      }),
      this.entitlements.entitlements(tenantId),
    ]);
    const entries: FlagEntry[] = [];
    for (const g of globals)
      entries.push({ scope: 'GLOBAL', key: g.key, value: g.value as FlagValue });
    for (const [key, value] of Object.entries(ent.features ?? {})) {
      entries.push({ scope: 'PLAN', key, value: value as FlagValue });
    }
    for (const t of tenantRows)
      entries.push({ scope: 'TENANT', key: t.key, value: t.value as FlagValue });
    return entries;
  }

  /** The effective flag map for a tenant (highest scope per key wins). */
  async resolve(tenantId: string): Promise<Record<string, FlagValue>> {
    return resolveAllFlags(await this.entriesFor(tenantId));
  }

  /** Is a feature enabled for a tenant? (gate call — used across the app). */
  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    const entries = await this.entriesFor(tenantId);
    return isFlagEnabled(resolveFlag(entries, key, false));
  }

  /** Set a GLOBAL (super-admin) or TENANT (own) flag. Audited. */
  async set(actor: Actor, input: unknown): Promise<FlagDto> {
    const parsed = flagInputSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid flag');
    const { key, value, scope } = parsed.data;
    if (scope === 'PLAN') {
      throw new ValidationError('Plan flags are edited on the plan (features), not here');
    }
    const tenantId = this.scopeTenant(actor, scope);
    // A nullable column in the composite unique can't be used in Prisma's `where` upsert, so
    // find-then-write explicitly (GLOBAL flags have tenantId null).
    const jsonValue = value as Prisma.InputJsonValue;
    const existing = await this.db.admin.featureFlag.findFirst({
      where: { scope, key, tenantId },
      select: { id: true },
    });
    if (existing) {
      await this.db.admin.featureFlag.update({
        where: { id: existing.id },
        data: { value: jsonValue },
      });
    } else {
      await this.db.admin.featureFlag.create({ data: { scope, key, value: jsonValue, tenantId } });
    }
    await this.audit(actor, tenantId, 'flag.set', `${scope}:${key}`, { value });
    return { scope, key, value };
  }

  /** Remove a GLOBAL/TENANT flag override. Audited. */
  async remove(actor: Actor, scope: 'GLOBAL' | 'TENANT', key: string): Promise<{ removed: true }> {
    const tenantId = this.scopeTenant(actor, scope);
    await this.db.admin.featureFlag.deleteMany({ where: { scope, key, tenantId } });
    await this.audit(actor, tenantId, 'flag.remove', `${scope}:${key}`, {});
    return { removed: true };
  }

  private scopeTenant(actor: Actor, scope: 'GLOBAL' | 'TENANT'): string | null {
    if (scope === 'GLOBAL') {
      if (actor.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenError('Only a super-admin can set global flags');
      }
      return null;
    }
    return actor.tenantId;
  }

  private async audit(
    actor: Actor,
    tenantId: string | null,
    action: string,
    target: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.db.admin.auditLog.create({
      data: {
        tenantId: tenantId ?? actor.tenantId,
        actorUserId: actor.userId,
        action,
        target,
        meta: meta as object,
      },
    });
  }
}
