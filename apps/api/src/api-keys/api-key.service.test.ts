import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { ApiKeyService } from './api-key.service';

/**
 * Public API keys (Day 48) against real Postgres + RLS. Proves: create returns the plaintext
 * ONCE + stores only a hash, authenticate resolves tenant+scopes (and rejects revoked/unknown),
 * metering increments the counter, and keys are tenant-isolated (self-audit C + B + D).
 */

const db = new PrismaService();
const svc = new ApiKeyService(db);
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002';
const ids: string[] = [];

afterAll(async () => {
  await db.admin.apiKey.deleteMany({ where: { id: { in: ids } } });
});

describe('ApiKeyService', () => {
  it('creates a key (plaintext once), stores only a hash, and authenticates it', async () => {
    const created = await svc.create(C1, { name: 'CI key', scopes: ['agents:read', 'calls:read'] });
    ids.push(created.id);
    expect(created.key).toMatch(/^vq_live_/);

    // The stored row never exposes the secret; list omits it entirely.
    const listed = await svc.list(C1);
    expect(JSON.stringify(listed)).not.toContain(created.key);
    expect(listed.find((k) => k.id === created.id)?.prefix).toBe(created.prefix);

    const auth = await svc.authenticate(created.key);
    expect(auth?.tenantId).toBe(C1);
    expect(auth?.scopes).toContain('agents:read');
  });

  it('rejects an unknown, malformed, or revoked key', async () => {
    expect(await svc.authenticate('vq_live_deadbeef')).toBeNull();
    expect(await svc.authenticate('not-a-key')).toBeNull();
    expect(await svc.authenticate(undefined)).toBeNull();

    const k = await svc.create(C1, { name: 'to revoke', scopes: ['agents:read'] });
    ids.push(k.id);
    await svc.revoke(C1, k.id);
    expect(await svc.authenticate(k.key)).toBeNull();
  });

  it('meters usage (requestCount increments)', async () => {
    const k = await svc.create(C1, { name: 'metered', scopes: ['agents:read'] });
    ids.push(k.id);
    await svc.meter(k.id);
    await svc.meter(k.id);
    const row = await db.admin.apiKey.findUnique({
      where: { id: k.id },
      select: { requestCount: true },
    });
    expect(row?.requestCount).toBe(2);
  });

  it('a child cannot see or revoke a parent key (self-audit B)', async () => {
    const parent = await svc.create(R1, { name: 'parent key', scopes: ['agents:read'] });
    ids.push(parent.id);
    expect((await svc.list(C1)).some((k) => k.id === parent.id)).toBe(false);
    await expect(svc.revoke(C1, parent.id)).rejects.toThrow(/not found/i);
  });
});
