import { Capability, Provider, Role } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { buildEncryptor } from '../crypto/envelope';
import { PrismaService } from '../db/prisma.service';
import { RoutingDefaultsService } from './routing-defaults.service';
import { type Actor, VaultService } from './vault.service';

/**
 * Provider key vault (Day 57) against real Postgres. Proves the critical security property
 * (self-audit C): a stored key is ENVELOPE-ENCRYPTED at rest (its plaintext never appears in the
 * DB row), reads are masked, platform keys are super-admin-only, rotation/revocation are audited.
 * Plus routing-defaults validation + resolution (self-audit D).
 */

const db = new PrismaService();
const enc = buildEncryptor();
const svc = new VaultService(db, enc);
const routing = new RoutingDefaultsService(db);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const C1 = '00000000-0000-0000-0000-000000000003'; // seed customer
const SUPER: Actor = {
  userId: '00000000-0000-0000-0000-00000000000a',
  tenantId: PLATFORM,
  role: Role.SUPER_ADMIN,
};
const OWNER: Actor = {
  userId: '00000000-0000-0000-0000-0000057a000b',
  tenantId: C1,
  role: Role.OWNER,
};

const createdKeyIds: string[] = [];

afterAll(async () => {
  await db.admin.providerCredential.deleteMany({ where: { id: { in: createdKeyIds } } });
  await db.admin.auditLog.deleteMany({ where: { action: { startsWith: 'vault.' } } });
  await db.admin.tenant.update({ where: { id: PLATFORM }, data: { settings: {} } });
  await db.admin.tenant.update({ where: { id: C1 }, data: { settings: {} } });
});

describe('VaultService key storage (encrypted at rest — self-audit C)', () => {
  const SECRET = 'fake-test-provider-value-4321';

  it('stores a BYOK key encrypted — the plaintext is NOT in the DB row, and reads are masked', async () => {
    const dto = await svc.addKey(OWNER, {
      provider: Provider.OPENAI,
      apiKey: SECRET,
      scope: 'tenant',
    });
    createdKeyIds.push(dto.id);
    expect(dto.last4).toBe('••••4321');
    expect(JSON.stringify(dto)).not.toContain(SECRET); // never returned

    // The raw persisted bytes must not contain the plaintext, and must decrypt back correctly.
    const row = await db.admin.providerCredential.findUnique({
      where: { id: dto.id },
      select: { encryptedKey: true, meta: true },
    });
    const raw = Buffer.from(row!.encryptedKey).toString('latin1');
    expect(raw).not.toContain(SECRET);
    expect(JSON.stringify(row!.meta)).not.toContain(SECRET);
    expect(enc.decrypt(row!.encryptedKey)).toBe(SECRET);
  });

  it('writes an audit row on add', async () => {
    const audits = await db.admin.auditLog.findMany({
      where: { action: 'vault.key.add', tenantId: C1 },
    });
    expect(audits.length).toBeGreaterThan(0);
  });

  it('rotates a key (new ciphertext + last4) and audits it', async () => {
    const dto = await svc.addKey(OWNER, {
      provider: Provider.DEEPGRAM,
      apiKey: 'dg-oldkey-1111',
      scope: 'tenant',
    });
    createdKeyIds.push(dto.id);
    const rotated = await svc.rotate(OWNER, dto.id, 'dg-newkey-2222');
    expect(rotated.last4).toBe('••••2222');
    const row = await db.admin.providerCredential.findUnique({
      where: { id: dto.id },
      select: { encryptedKey: true },
    });
    expect(enc.decrypt(row!.encryptedKey)).toBe('dg-newkey-2222');
    const audits = await db.admin.auditLog.findMany({
      where: { action: 'vault.key.rotate', target: dto.id },
    });
    expect(audits.length).toBe(1);
  });

  it('revokes a key + audits it', async () => {
    const dto = await svc.addKey(OWNER, {
      provider: Provider.ELEVENLABS,
      apiKey: 'el-key-3333',
      scope: 'tenant',
    });
    await svc.revoke(OWNER, dto.id);
    const gone = await db.admin.providerCredential.findUnique({ where: { id: dto.id } });
    expect(gone).toBeNull();
    const audits = await db.admin.auditLog.findMany({
      where: { action: 'vault.key.revoke', target: dto.id },
    });
    expect(audits.length).toBe(1);
  });
});

describe('VaultService scope (self-audit C)', () => {
  it('forbids a non-super-admin from creating a PLATFORM key', async () => {
    await expect(
      svc.addKey(OWNER, {
        provider: Provider.OPENAI,
        apiKey: 'fake-platform-value-xyz',
        scope: 'platform',
      }),
    ).rejects.toThrow();
  });

  it('lets a super-admin create a platform key (tenantId null)', async () => {
    const dto = await svc.addKey(SUPER, {
      provider: Provider.OPENAI,
      apiKey: 'fake-platform-value-abcd',
      scope: 'platform',
    });
    createdKeyIds.push(dto.id);
    expect(dto.scope).toBe('platform');
    expect(dto.byok).toBe(false);
  });
});

describe('RoutingDefaultsService (self-audit D)', () => {
  it('validates + persists platform defaults and rejects an invalid provider/capability', async () => {
    const saved = await routing.setPlatform(SUPER, {
      llm: { primary: Provider.ANTHROPIC, fallbacks: [Provider.OPENAI] },
    });
    expect(saved.llm?.primary).toBe(Provider.ANTHROPIC);
    await expect(
      routing.setPlatform(SUPER, { tts: { primary: Provider.OPENAI } }),
    ).rejects.toThrow();
  });

  it('resolves a tenant override over the platform default', async () => {
    await routing.setPlatform(SUPER, { llm: { primary: Provider.OPENAI } });
    await routing.setTenant(C1, { llm: { primary: Provider.ANTHROPIC } });
    const chain = await routing.resolveChain(C1, Capability.LLM);
    expect(chain[0]).toBe(Provider.ANTHROPIC);
  });

  it('forbids a non-super-admin from setting platform defaults', async () => {
    await expect(
      routing.setPlatform(OWNER, { llm: { primary: Provider.OPENAI } }),
    ).rejects.toThrow();
  });
});
