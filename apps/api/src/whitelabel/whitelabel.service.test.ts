import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import type { CfCustomHostname, CloudflareClient } from './cloudflare';
import { WhiteLabelService } from './whitelabel.service';

/**
 * White-label (Day 52) against real Postgres + RLS. Proves: branding get/set + CSS-var theming,
 * domain provisioning through Cloudflare (fake) + gated fallback, hostname→tenant resolution,
 * no-platform-leak when hidden, and tenant scoping (self-audit B + C + H).
 *
 * Runs on DEDICATED tenants — never the shared seed tenants `…0003`/`…0002`. Provisioning writes
 * `tenant.settings.domain`, and this suite used to full-wipe the shared customer's `settings` in
 * teardown, clobbering other suites' settings mid-assertion under vitest's parallel file execution
 * (the settings cross-suite race). Its own customer + reseller are created here and dropped in
 * afterAll, so no shared row is ever read-modified or wiped.
 */

const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const C1 = '00000000-0000-0000-0000-0000052a0003'; // this suite's own customer
const R1 = '00000000-0000-0000-0000-0000052a0002'; // this suite's own reseller
const DOMAINS = ['calls.acme.com', 'voice.reseller.co'];

const liveCf: CloudflareClient = {
  configured: true,
  cnameTarget: 'cname.vocaliq.dev',
  createCustomHostname: vi.fn(
    async (): Promise<CfCustomHostname> => ({
      id: 'cf_123',
      status: 'pending_validation',
      sslStatus: 'pending_validation',
    }),
  ),
  getCustomHostname: vi.fn(
    async (): Promise<CfCustomHostname> => ({
      id: 'cf_123',
      status: 'active',
      sslStatus: 'active',
    }),
  ),
};
const disabledCf: CloudflareClient = {
  configured: false,
  cnameTarget: 'cname.vocaliq.dev',
  createCustomHostname: vi.fn(),
  getCustomHostname: vi.fn(),
};

const svc = new WhiteLabelService(db, liveCf);
const gatedSvc = new WhiteLabelService(db, disabledCf);

beforeAll(async () => {
  // `customDomain` is globally unique — free the hostnames this suite claims from any stale owner
  // (e.g. an old shared-tenant run) so provisioning doesn't false-conflict.
  await db.admin.tenant.updateMany({
    where: { customDomain: { in: DOMAINS } },
    data: { customDomain: null },
  });
  await db.admin.tenant.upsert({
    where: { id: R1 },
    create: {
      id: R1,
      type: 'RESELLER',
      name: 'Reseller',
      slug: `wl-reseller-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: { branding: {}, customDomain: null, settings: {} },
  });
  await db.admin.tenant.upsert({
    where: { id: C1 },
    create: {
      id: C1,
      type: 'CUSTOMER',
      name: 'Customer',
      slug: `wl-customer-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: { branding: {}, customDomain: null, settings: {} },
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [C1, R1] } } });
});

describe('branding (theming — self-audit H)', () => {
  it('sets branding and it re-themes via CSS vars; child never sees the parent branding', async () => {
    const b = await svc.setBranding(C1, {
      name: 'Acme Voice',
      primaryColor: '#ff5500',
      hidePlatformName: true,
    });
    expect(b.name).toBe('Acme Voice');
    expect((await svc.getBranding(C1)).primaryColor).toBe('#ff5500');

    await svc.setBranding(R1, { name: 'Parent Brand', primaryColor: '#0000ff' });
    // getBranding is RLS-scoped to the caller's own tenant.
    expect((await svc.getBranding(C1)).name).toBe('Acme Voice');
  });
});

describe('custom domain provisioning (self-audit C)', () => {
  it('provisions through Cloudflare, records status + CNAME, and refreshes to active', async () => {
    const cfg = await svc.provisionDomain(C1, 'Calls.Acme.com'); // normalises
    expect(cfg.hostname).toBe('calls.acme.com');
    expect(cfg.status).toBe('pending_validation');
    expect(cfg.cnameTarget).toBe('cname.vocaliq.dev');
    expect(cfg.cloudflareId).toBe('cf_123');

    const refreshed = await svc.refreshDomain(C1);
    expect(refreshed?.status).toBe('active');
  });

  it('rejects a domain already claimed by another tenant', async () => {
    await expect(svc.provisionDomain(R1, 'calls.acme.com')).rejects.toThrow(/already in use/);
  });

  it('gated: with no Cloudflare configured, records the domain as pending with the CNAME', async () => {
    const cfg = await gatedSvc.provisionDomain(R1, 'voice.reseller.co');
    expect(cfg.status).toBe('pending');
    expect(cfg.cnameTarget).toBe('cname.vocaliq.dev');
    expect(cfg.cloudflareId).toBeUndefined();
  });
});

describe('hostname → tenant resolution (self-audit B)', () => {
  it('resolves an inbound host to its tenant + theme, hiding the platform when set', async () => {
    const resolved = await svc.resolveByHostname('calls.acme.com');
    expect(resolved?.tenantId).toBe(C1);
    expect(resolved?.name).toBe('Acme Voice');
    expect(resolved?.cssVars['--vq-violet']).toBe('#ff5500');

    // A tenant that hides the platform name + has no brand name would resolve to '' (no leak).
    await svc.setBranding(C1, { hidePlatformName: true });
    expect((await svc.resolveByHostname('calls.acme.com'))?.name).toBe('');
  });

  it('returns null for an unknown host', async () => {
    expect(await svc.resolveByHostname('nobody.example.org')).toBeNull();
  });
});
