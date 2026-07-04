import { Role, type SsoProfile } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyJwtToken } from '../auth/jwt';
import { PrismaService } from '../db/prisma.service';
import type { SsoProvider } from './sso-provider';
import { type Actor, SsoService } from './sso.service';

/**
 * Enterprise SSO/SAML + SCIM (Day 59) against real Postgres. Proves SAML login JIT-provisions with
 * role mapping (mock IdP), SCIM provisions/deprovisions + maps roles, and IdP config is
 * tenant-isolated (self-audit B/C). The live IdP handshake is mocked via an injected provider.
 */

const db = new PrismaService();

// A mock IdP: returns a fixed profile so we can test the JIT + role-mapping flow without a network.
const mockProfile: SsoProfile = {
  email: 'enterprise.user@acme.com',
  name: 'Enterprise User',
  groups: ['admins'],
  idpUserId: 'idp-1',
};
const mockProvider: SsoProvider = {
  name: 'mock',
  async getAuthorizationUrl() {
    return 'https://idp.acme.com/authorize?mock=1';
  },
  async validateCallback() {
    return mockProfile;
  },
};

process.env.APP_JWT_SECRET ??= 'test-secret-at-least-16-chars-long';
const svc = new SsoService(db, mockProvider, 'https://app.test');

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer
const C2 = '00000000-0000-0000-0000-0000059a0001'; // a second tenant (this test)
const OWNER1: Actor = {
  userId: '00000000-0000-0000-0000-0000059a000a',
  tenantId: C1,
  role: Role.OWNER,
};
const OWNER2: Actor = {
  userId: '00000000-0000-0000-0000-0000059a000b',
  tenantId: C2,
  role: Role.OWNER,
};

const SAML = {
  config: { provider: 'SAML' as const, entryPoint: 'https://idp.acme.com/sso', issuer: 'urn:acme' },
  roleMappings: { admins: Role.ADMIN, sales: Role.AGENT },
  defaultRole: Role.AGENT,
  scimEnabled: true,
  enabled: true,
};

const createdEmails = ['enterprise.user@acme.com', 'scim.user@acme.com'];

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: C2 },
    create: {
      id: C2,
      type: 'CUSTOMER',
      name: 'Acme2',
      slug: `acme2-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
});

afterAll(async () => {
  const users = await db.admin.user.findMany({
    where: { email: { in: createdEmails } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.admin.membership.deleteMany({ where: { userId: { in: ids } } });
  await db.admin.user.deleteMany({ where: { id: { in: ids } } });
  await db.admin.ssoConnection.deleteMany({ where: { tenantId: { in: [C1, C2] } } });
  await db.admin.auditLog.deleteMany({ where: { action: { startsWith: 'sso.' } } });
  await db.admin.tenant.deleteMany({ where: { id: C2 } });
});

describe('SsoService.configure (tenant-isolated — self-audit B/C)', () => {
  it('stores a connection + mints a SCIM token once (hashed at rest)', async () => {
    const { connection, scimToken } = await svc.configure(OWNER1, SAML);
    expect(connection.enabled).toBe(true);
    expect(scimToken).toMatch(/^scim_/);
    // The plaintext token is NEVER stored — only its hash.
    const row = await db.admin.ssoConnection.findUnique({
      where: { tenantId: C1 },
      select: { scimTokenHash: true },
    });
    expect(row?.scimTokenHash).toBeTruthy();
    expect(row?.scimTokenHash).not.toBe(scimToken);
  });

  it('a tenant reads only its OWN connection', async () => {
    await svc.configure(OWNER2, { ...SAML, config: { ...SAML.config, issuer: 'urn:acme2' } });
    const c1 = await svc.getConnection(C1);
    const c2 = await svc.getConnection(C2);
    expect(c1?.issuer).toBe('urn:acme');
    expect(c2?.issuer).toBe('urn:acme2');
  });
});

describe('SsoService.handleCallback (SAML login → JIT + role mapping)', () => {
  it('provisions a user + ADMIN membership from the mapped group and issues a token', async () => {
    const { token, userId } = await svc.handleCallback(C1, 'mock-code');
    const claims = await verifyJwtToken(token);
    expect(claims.userId).toBe(userId);

    const membership = await db.admin.membership.findFirst({
      where: { tenantId: C1, userId },
      select: { role: true, status: true },
    });
    expect(membership?.role).toBe(Role.ADMIN); // 'admins' group → ADMIN
    expect(membership?.status).toBe('ACTIVE');
  });
});

describe('SsoService SCIM directory sync', () => {
  let scimToken: string;
  beforeAll(async () => {
    // Re-configure C2 with a fresh SCIM token we can capture.
    await db.admin.ssoConnection.update({
      where: { tenantId: C2 },
      data: { scimTokenHash: null, scimEnabled: false },
    });
    const res = await svc.configure(OWNER2, {
      ...SAML,
      config: { ...SAML.config, issuer: 'urn:acme2' },
    });
    scimToken = res.scimToken as string;
  });

  it('provisions a user via SCIM with role mapping, then deprovisions (suspend)', async () => {
    const prov = await svc.scimProvision(C2, `Bearer ${scimToken}`, {
      userName: 'scim.user@acme.com',
      displayName: 'Scim User',
      groups: [{ display: 'sales' }],
      active: true,
    });
    expect(prov.role).toBe(Role.AGENT); // 'sales' → AGENT
    const user = await db.admin.user.findUnique({
      where: { email: 'scim.user@acme.com' },
      select: { id: true },
    });
    const m = await db.admin.membership.findFirst({
      where: { tenantId: C2, userId: user!.id },
      select: { status: true },
    });
    expect(m?.status).toBe('ACTIVE');

    await svc.scimDeprovision(C2, `Bearer ${scimToken}`, 'scim.user@acme.com');
    const after = await db.admin.membership.findFirst({
      where: { tenantId: C2, userId: user!.id },
      select: { status: true },
    });
    expect(after?.status).toBe('SUSPENDED');
  });

  it('rejects a bad SCIM token', async () => {
    await expect(
      svc.scimProvision(C2, 'Bearer wrong-token', {
        userName: 'x@y.com',
        groups: [],
        active: true,
      }),
    ).rejects.toThrow();
  });
});
