import {
  type ResidencyConfig,
  Role,
  ValidationError,
  platformRegion,
  regionEndpoints,
  residencyConfigSchema,
  resolveRegion,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Data residency (Day 61) — per-tenant region pinning + routing. A tenant pins its data +
 * processing to a region (stored in tenant settings); the platform resolves the effective region
 * (pinned → platform default) and hands services the regional storage/voice endpoints so a call's
 * recordings, transcripts, and voice infra stay in-region. Setting residency is an admin action
 * and is audited. For single-tenant VPC installs, `DATA_REGION` pins the whole deployment.
 */

export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface ResolvedResidency {
  region: string;
  strictEgress: boolean;
  storageHost: string;
  voiceHost: string;
}

export class ResidencyService {
  constructor(
    private readonly db: PrismaService,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  /** The platform's own deploy region (VPC installs pin this via DATA_REGION). */
  platformRegion(): string {
    return platformRegion(this.env);
  }

  /** A tenant's pinned residency config, or null if it hasn't set one. */
  async getResidency(tenantId: string): Promise<ResidencyConfig | null> {
    const raw = await this.readRaw(tenantId);
    if (!raw) return null;
    const parsed = residencyConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  /** Pin a tenant to a region. Admin-only; validated + audited. */
  async setResidency(actor: Actor, input: unknown): Promise<ResidencyConfig> {
    if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.OWNER && actor.role !== Role.ADMIN) {
      throw new ValidationError('Only an admin can set data residency');
    }
    const config = residencyConfigSchema.parse(input);
    const t = await this.db.withTenant(actor.tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: actor.tenantId }, select: { settings: true } }),
    );
    const settings = { ...((t?.settings as object) ?? {}), residency: config };
    await this.db.withTenant(actor.tenantId, (tx) =>
      tx.tenant.update({ where: { id: actor.tenantId }, data: { settings: settings as object } }),
    );
    await this.db.admin.auditLog.create({
      data: {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'residency.set',
        target: config.region,
        meta: { region: config.region, strictEgress: config.strictEgress } as object,
      },
    });
    return config;
  }

  /**
   * Resolve the effective region + regional endpoints for a tenant. This is the routing hook: the
   * storage layer picks `storageHost`, the voice service picks `voiceHost`, so a call's data never
   * leaves the tenant's pinned region.
   */
  async resolve(tenantId: string): Promise<ResolvedResidency> {
    const config = await this.getResidency(tenantId);
    const region = resolveRegion(config?.region ?? null, this.platformRegion());
    const endpoints = regionEndpoints(region);
    return {
      region,
      strictEgress: config?.strictEgress ?? false,
      storageHost: endpoints.storageHost,
      voiceHost: endpoints.voiceHost,
    };
  }

  private async readRaw(tenantId: string): Promise<unknown> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    return (t?.settings as { residency?: unknown } | null)?.residency ?? null;
  }
}
