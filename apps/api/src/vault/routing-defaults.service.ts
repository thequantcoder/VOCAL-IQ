import {
  type Capability,
  ForbiddenError,
  type Provider,
  Role,
  type RoutingDefaults,
  ValidationError,
  resolveProviderChain,
  validateRoutingDefaults,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

const PLATFORM = '00000000-0000-0000-0000-000000000001';

/**
 * Routing defaults (Day 57): the per-capability default + fallback provider policy. Platform-wide
 * defaults (SUPER_ADMIN) live on the platform tenant's settings; a tenant may set its own override
 * (self-audit D). Every write is validated (a provider must actually serve its capability) — the
 * pure logic is in @vocaliq/shared and unit-tested. Resolution merges tenant override over the
 * platform default over the code default.
 */
export class RoutingDefaultsService {
  constructor(private readonly db: PrismaService) {}

  /** The platform-wide defaults (SUPER_ADMIN view/edit). */
  async getPlatform(): Promise<RoutingDefaults> {
    return this.read(PLATFORM);
  }

  async setPlatform(actor: { role: Role }, input: unknown): Promise<RoutingDefaults> {
    if (actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError('Only a super-admin can set platform routing defaults');
    }
    return this.write(PLATFORM, input);
  }

  /** A tenant's own override (merged over platform on resolve). */
  async getTenant(tenantId: string): Promise<RoutingDefaults> {
    return this.read(tenantId);
  }

  async setTenant(tenantId: string, input: unknown): Promise<RoutingDefaults> {
    return this.write(tenantId, input);
  }

  /**
   * The effective ordered provider chain for a (tenant, capability): tenant override first, else
   * the platform default, else the code default. Used by the router when selecting a provider.
   */
  async resolveChain(tenantId: string, capability: Capability): Promise<Provider[]> {
    const [tenant, platform] = await Promise.all([this.read(tenantId), this.read(PLATFORM)]);
    if (tenant[capability]) return resolveProviderChain(tenant, capability);
    return resolveProviderChain(platform, capability);
  }

  private async read(tenantId: string): Promise<RoutingDefaults> {
    const t = await this.db.admin.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const raw = (t?.settings as { routingDefaults?: unknown } | null)?.routingDefaults;
    if (!raw) return {};
    try {
      return validateRoutingDefaults(raw);
    } catch {
      return {}; // never let a stale/invalid stored config break resolution
    }
  }

  private async write(tenantId: string, input: unknown): Promise<RoutingDefaults> {
    let validated: RoutingDefaults;
    try {
      validated = validateRoutingDefaults(input);
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Invalid routing defaults');
    }
    const t = await this.db.admin.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = { ...((t?.settings as object) ?? {}), routingDefaults: validated };
    await this.db.admin.tenant.update({
      where: { id: tenantId },
      data: { settings: settings as object },
    });
    return validated;
  }
}
