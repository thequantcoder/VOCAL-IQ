import { hasScope, isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiKeyService } from '../api-keys/api-key.service';
import { PrismaService } from '../db/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { DeveloperAppsService } from './developer-apps.service';

/**
 * Developer app marketplace (Day 84) — real Postgres, RLS-scoped. Proves register(+security scan) →
 * review → browse → install (scoped-key mint + consent subset + paid split) → permission enforcement
 * via the minted key → uninstall (revocation), plus no-double-install, self-install block, and
 * cross-tenant isolation.
 */

const db = new PrismaService();
const apiKeys = new ApiKeyService(db);
const wallet = new WalletService(db);
const svc = new DeveloperAppsService(db, apiKeys, wallet);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const DEV = '00000000-0000-0000-0000-0000084a0001';
const INSTALLER = '00000000-0000-0000-0000-0000084a0002';

beforeAll(async () => {
  for (const id of [DEV, INSTALLER]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `App ${id.slice(-4)}`,
        slug: `app-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await wallet.topUp(INSTALLER, { amountCents: 1_000_000, key: `seed84-${Date.now()}` });
});

afterAll(async () => {
  await db.admin.appInstall.deleteMany({ where: { installerTenantId: { in: [DEV, INSTALLER] } } });
  await db.admin.developerApp.deleteMany({
    where: { developerTenantId: { in: [DEV, INSTALLER] } },
  });
  await db.admin.apiKey.deleteMany({ where: { tenantId: { in: [DEV, INSTALLER] } } });
  await db.admin.walletLedger.deleteMany({ where: { tenantId: { in: [DEV, INSTALLER] } } });
  await db.admin.wallet.deleteMany({ where: { tenantId: { in: [DEV, INSTALLER] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [DEV, INSTALLER] } } });
});

let appId = '';

describe('Register + security scan (self-audit C)', () => {
  it('registers a draft app and returns the client secret ONCE', async () => {
    const { app, clientSecret } = await svc.register(DEV, {
      name: 'CRM Sync Pro',
      description: 'Syncs leads to your CRM',
      requestedScopes: ['leads:read', 'agents:read'],
      events: ['lead.created'],
      webhookUrl: 'https://crm-sync.example.com/hook',
      priceCents: 5000,
    });
    appId = app.id;
    expect(app.status).toBe('draft');
    expect(clientSecret.startsWith('vqsk_')).toBe(true);
    // The secret is hashed at rest — never stored in plaintext.
    const stored = await db.admin.developerApp.findUniqueOrThrow({
      where: { id: appId },
      select: { hashedSecret: true },
    });
    expect(stored.hashedSecret).not.toBe(clientSecret);
  });

  it('REJECTS an app requesting the wildcard scope (security scan blocker)', async () => {
    await expect(
      svc.register(DEV, { name: 'Greedy App', requestedScopes: ['*'], priceCents: 0 }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('REJECTS an app with an SSRF/internal webhook URL', async () => {
    await expect(
      svc.register(DEV, {
        name: 'Sneaky App',
        requestedScopes: ['leads:read'],
        webhookUrl: 'http://169.254.169.254/latest/meta-data',
        priceCents: 0,
      }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });
});

describe('Review gate (self-audit C)', () => {
  it('a draft app is NOT installable', async () => {
    await expect(svc.install(INSTALLER, appId)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });

  it('submit → pending → platform approve → browsable', async () => {
    await svc.setStatus(DEV, appId, 'pending');
    const approved = await svc.review(appId, 'approve');
    expect(approved.status).toBe('approved');
    expect((await svc.browse()).some((a) => a.id === appId)).toBe(true);
  });

  it('a developer cannot approve their own app', async () => {
    // setStatus only permits pending|draft; approval is a platform action, refused at runtime.
    await expect(svc.setStatus(DEV, appId, 'approved')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('the public catalogue never exposes the secret or the internal webhook URL', async () => {
    const listed = (await svc.browse()).find((a) => a.id === appId);
    expect(listed).toBeTruthy();
    expect(listed as Record<string, unknown>).not.toHaveProperty('hashedSecret');
    expect(listed as Record<string, unknown>).not.toHaveProperty('webhookUrl');
  });
});

describe('Install + consent + paid split + scoped key (self-audit C/D/B)', () => {
  it('installs with consent, charges the installer, pays the developer, and mints a scoped key', async () => {
    const installerBefore = (await wallet.getBalance(INSTALLER)).balanceCents;
    const devBefore = (await wallet.getBalance(DEV)).balanceCents;

    // Consent to only ONE of the two requested scopes.
    const { install, apiKey } = await svc.install(INSTALLER, appId, ['leads:read']);
    expect(install.status).toBe('active');
    expect(install.grantedScopes).toEqual(['leads:read']);
    expect(install.pricePaidCents).toBe(5000);
    expect(install.developerCents).toBe(3500); // 70% default
    expect(install.platformCents).toBe(1500);
    expect(apiKey?.key.startsWith('vq_live_')).toBe(true);

    // Money moved exactly.
    expect(installerBefore - (await wallet.getBalance(INSTALLER)).balanceCents).toBe(5000);
    expect((await wallet.getBalance(DEV)).balanceCents - devBefore).toBe(3500);

    // The minted key belongs to the INSTALLER tenant and carries ONLY the consented scope.
    const authed = await apiKeys.authenticate(apiKey?.key);
    expect(authed?.tenantId).toBe(INSTALLER);
    expect(hasScope(authed?.scopes ?? [], 'leads:read')).toBe(true);
    expect(hasScope(authed?.scopes ?? [], 'agents:read')).toBe(false); // NOT consented → denied
  });

  it('cannot consent to a scope the app did not request', async () => {
    // campaigns:read was never requested by this app.
    await expect(svc.install(INSTALLER, appId, ['campaigns:read'])).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('never double-charges / double-mints on a repeat install', async () => {
    const installerBefore = (await wallet.getBalance(INSTALLER)).balanceCents;
    const keysBefore = await db.admin.apiKey.count({
      where: { tenantId: INSTALLER, revoked: false },
    });
    const again = await svc.install(INSTALLER, appId, ['leads:read']);
    expect(again.install.status).toBe('active');
    expect(again.apiKey).toBeNull(); // no new key handed out
    expect((await wallet.getBalance(INSTALLER)).balanceCents).toBe(installerBefore); // no re-charge
    expect(await db.admin.apiKey.count({ where: { tenantId: INSTALLER, revoked: false } })).toBe(
      keysBefore,
    );
  });

  it('a developer cannot install their own app', async () => {
    await expect(svc.install(DEV, appId)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });
});

describe('Uninstall revokes the scoped key (self-audit C)', () => {
  it('uninstalling revokes the minted key so it no longer authenticates', async () => {
    const before = await db.admin.appInstall.findFirstOrThrow({
      where: { installerTenantId: INSTALLER, appId },
      select: { apiKeyId: true },
    });
    // Fetch the key row to prove it flips to revoked.
    const uninstalled = await svc.uninstall(INSTALLER, appId);
    expect(uninstalled.status).toBe('revoked');
    const keyRow = await db.admin.apiKey.findUniqueOrThrow({
      where: { id: before.apiKeyId ?? '' },
      select: { revoked: true },
    });
    expect(keyRow.revoked).toBe(true);
  });
});

describe('Reinstall after uninstall (self-audit C/D)', () => {
  it('reinstalling a previously-uninstalled app works and charges again (fresh key)', async () => {
    const installerBefore = (await wallet.getBalance(INSTALLER)).balanceCents;
    const { install, apiKey } = await svc.install(INSTALLER, appId, ['leads:read']);
    expect(install.status).toBe('active');
    expect(apiKey?.key.startsWith('vq_live_')).toBe(true); // a NEW key was minted
    // A reinstall is a new purchase — the install-instance-scoped idempotency key charges again.
    expect(installerBefore - (await wallet.getBalance(INSTALLER)).balanceCents).toBe(5000);
    // Leave a clean slate for later assertions: uninstall again.
    await svc.uninstall(INSTALLER, appId);
  });
});

describe('Install resume — partial-failure recovery (self-audit D)', () => {
  it('resumes an INCOMPLETE install exactly once: one charge, one key, one install-count bump', async () => {
    // A second installer simulates a prior attempt that reserved the install row but died before
    // charging/minting (apiKeyId null). Reuse INSTALLER? No — it already installed. Use a fresh app +
    // the same installer isn't possible (unique). Simulate on a fresh approved app instead.
    const { app } = await svc.register(DEV, {
      name: 'Resume Test App',
      requestedScopes: ['agents:read'],
      priceCents: 2000,
    });
    await svc.setStatus(DEV, app.id, 'pending');
    await svc.review(app.id, 'approve');

    // Reserve an incomplete install directly (apiKeyId null) — the partial-failure window.
    const reserved = await db.admin.appInstall.create({
      data: {
        installerTenantId: INSTALLER,
        appId: app.id,
        grantedScopes: ['agents:read'],
        pricePaidCents: 2000,
        developerCents: 1400,
        platformCents: 600,
      },
      select: { id: true },
    });

    const installerBefore = (await wallet.getBalance(INSTALLER)).balanceCents;
    const appBefore = await db.admin.developerApp.findUniqueOrThrow({
      where: { id: app.id },
      select: { installCount: true },
    });

    const { install, apiKey } = await svc.install(INSTALLER, app.id, ['agents:read']);
    expect(install.id).toBe(reserved.id); // resumed the SAME row
    expect(install.status).toBe('active');
    expect(apiKey?.key.startsWith('vq_live_')).toBe(true); // minted on resume
    expect(installerBefore - (await wallet.getBalance(INSTALLER)).balanceCents).toBe(2000); // charged once
    const appAfter = await db.admin.developerApp.findUniqueOrThrow({
      where: { id: app.id },
      select: { installCount: true },
    });
    expect(appAfter.installCount).toBe(appBefore.installCount + 1); // counted once

    // A repeat call is a pure replay: no extra charge, no new key.
    const again = await svc.install(INSTALLER, app.id, ['agents:read']);
    expect(again.apiKey).toBeNull();
    expect((await wallet.getBalance(INSTALLER)).balanceCents).toBe(installerBefore - 2000);
  });
});

describe('Isolation (self-audit B)', () => {
  it('a draft app is not public and an installer never sees the developer’s apps', async () => {
    const draft = await svc.register(DEV, {
      name: 'Hidden Draft App',
      requestedScopes: ['agents:read'],
      priceCents: 0,
    });
    expect((await svc.browse()).some((a) => a.id === draft.app.id)).toBe(false);
    // The installer's "my apps" view never includes the developer's apps (RLS-scoped).
    expect((await svc.myApps(INSTALLER)).some((a) => a.id === appId)).toBe(false);
  });
});
