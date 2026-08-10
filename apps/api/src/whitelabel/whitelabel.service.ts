import {
  type Branding,
  ConflictError,
  type DomainConfig,
  ValidationError,
  brandName,
  brandingToCssVars,
  isValidHostname,
  normalizeHostname,
  parseBranding,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { CloudflareClient } from './cloudflare';

/**
 * White-label surface (Day 52): per-tenant branding (re-themes the whole UI) + reseller custom
 * domains with automatic SSL via Cloudflare for SaaS. Branding read/write is RLS-scoped
 * (self-audit B). Domain provisioning is GATED: with no Cloudflare configured the domain is
 * recorded + the CNAME instructions returned (status `pending`), never a fake success.
 * `resolveByHostname` (edge/gateway lookup) uses the owner client — an inbound request has no
 * tenant context yet — and NEVER leaks the platform identity when a reseller hides it.
 */
export class WhiteLabelService {
  constructor(
    private readonly db: PrismaService,
    private readonly cf: CloudflareClient,
  ) {}

  // ── Branding ─────────────────────────────────────────────────────────────────

  async getBranding(tenantId: string): Promise<Branding> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { branding: true } }),
    );
    return parseBranding(t?.branding);
  }

  async setBranding(tenantId: string, input: unknown): Promise<Branding> {
    const branding = parseBranding(input); // validates + drops unknowns
    await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data: { branding: branding as object } }),
    );
    return branding;
  }

  // ── Custom domains ─────────────────────────────────────────────────────────────

  async getDomain(tenantId: string): Promise<DomainConfig | null> {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({
        where: { id: tenantId },
        select: { customDomain: true, settings: true },
      }),
    );
    if (!t?.customDomain) return null;
    const saved = ((t.settings as { domain?: Partial<DomainConfig> })?.domain ??
      {}) as Partial<DomainConfig>;
    return {
      hostname: t.customDomain,
      status: saved.status ?? 'pending',
      cnameTarget: saved.cnameTarget ?? this.cf.cnameTarget,
      ...(saved.sslStatus ? { sslStatus: saved.sslStatus } : {}),
      ...(saved.cloudflareId ? { cloudflareId: saved.cloudflareId } : {}),
    };
  }

  /**
   * Provision a custom domain: validate the hostname, ensure it isn't already claimed, then
   * (if Cloudflare is configured) create the custom hostname + start SSL — else record it as
   * `pending` with the CNAME target so the reseller can set their DNS. Returns the config.
   */
  async provisionDomain(tenantId: string, rawHostname: string): Promise<DomainConfig> {
    const hostname = normalizeHostname(rawHostname);
    if (!isValidHostname(hostname)) throw new ValidationError('Enter a valid public domain');

    const taken = await this.db.admin.tenant.findUnique({
      where: { customDomain: hostname },
      select: { id: true },
    });
    if (taken && taken.id !== tenantId) throw new ConflictError('That domain is already in use');

    let config: DomainConfig = { hostname, status: 'pending', cnameTarget: this.cf.cnameTarget };
    if (this.cf.configured) {
      try {
        const cf = await this.cf.createCustomHostname(hostname);
        config = {
          hostname,
          status: cf.status,
          cnameTarget: this.cf.cnameTarget,
          cloudflareId: cf.id,
          ...(cf.sslStatus ? { sslStatus: cf.sslStatus } : {}),
        };
      } catch (err) {
        config = {
          hostname,
          status: 'failed',
          cnameTarget: this.cf.cnameTarget,
          sslStatus: (err as Error).message,
        };
      }
    }

    await this.saveDomain(tenantId, hostname, config);
    return config;
  }

  /** Refresh the SSL/hostname status from Cloudflare (no-op when unconfigured / no domain). */
  async refreshDomain(tenantId: string): Promise<DomainConfig | null> {
    const current = await this.getDomain(tenantId);
    if (!current || !this.cf.configured || !current.cloudflareId) return current;
    const cf = await this.cf.getCustomHostname(current.cloudflareId);
    const updated: DomainConfig = {
      ...current,
      status: cf.status,
      ...(cf.sslStatus ? { sslStatus: cf.sslStatus } : {}),
    };
    await this.saveDomain(tenantId, current.hostname, updated);
    return updated;
  }

  async removeDomain(tenantId: string): Promise<{ removed: true }> {
    await this.db.withTenant(tenantId, async (tx) => {
      const t = await tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } });
      // Drop the `domain` key without `delete` (destructure-omit).
      const { domain: _removed, ...settings } = ((t?.settings as object) ?? {}) as Record<
        string,
        unknown
      >;
      await tx.tenant.update({
        where: { id: tenantId },
        data: { customDomain: null, settings: settings as object },
      });
    });
    return { removed: true };
  }

  /**
   * Edge/gateway resolution: map an inbound hostname → its tenant + theme. Owner client (no
   * tenant context on an inbound request). Returns the branding CSS vars + the display name,
   * with the platform identity omitted when the reseller hid it (no leak — self-audit B + C).
   */
  async resolveByHostname(rawHostname: string): Promise<{
    tenantId: string;
    name: string;
    cssVars: Record<string, string>;
    branding: Branding;
  } | null> {
    const hostname = normalizeHostname(rawHostname);
    if (!isValidHostname(hostname)) return null;
    const tenant = await this.db.admin.tenant.findUnique({
      where: { customDomain: hostname },
      select: { id: true, branding: true, status: true },
    });
    if (!tenant || tenant.status === 'SUSPENDED') return null;
    const branding = parseBranding(tenant.branding);
    return {
      tenantId: tenant.id,
      name: brandName(branding),
      cssVars: brandingToCssVars(branding),
      branding,
    };
  }

  private async saveDomain(
    tenantId: string,
    hostname: string,
    config: DomainConfig,
  ): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      const t = await tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } });
      const settings = { ...((t?.settings as object) ?? {}), domain: config };
      await tx.tenant.update({
        where: { id: tenantId },
        data: { customDomain: hostname, settings: settings as object },
      });
    });
  }
}
