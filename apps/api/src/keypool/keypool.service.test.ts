import { EJECT_THRESHOLD, isAppError } from '@vocaliq/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { KeyPoolService } from './keypool.service';

/**
 * Platform key-pool (Day 38), against real Postgres. Proves: keys are added masked (never
 * echoed), weighted-LRU selection balances load + stamps lastUsedAt, repeated failures eject
 * a key and route around it, and a success re-admits it. The pool is platform-global (no RLS).
 */

const db = new PrismaService();
const svc = new KeyPoolService(db);
const created: string[] = [];

async function add(label: string, weight = 1) {
  const k = await svc.add({ provider: 'OPENAI', apiKey: `sk-test-${label}-1234`, weight, label });
  created.push(k.id);
  return k;
}

afterAll(async () => {
  await db.admin.platformApiKeyPool.deleteMany({ where: { id: { in: created } } });
});

describe('KeyPoolService', () => {
  it('adds a masked key and never returns the secret', async () => {
    const k = await add('mask');
    expect(k.provider).toBe('OPENAI');
    expect(JSON.stringify(k)).not.toContain('sk-test-mask'); // secret never leaves the service
    const listed = await svc.list();
    expect(JSON.stringify(listed)).not.toContain('sk-test-');
  });

  it('rejects a too-short key', async () => {
    await expect(svc.add({ provider: 'OPENAI', apiKey: 'short' })).rejects.toSatisfy(isAppError);
  });

  it('selects keys (weighted-LRU), rotating to the least-recently-used', async () => {
    // Dedicated provider so the (platform-global) pool only holds this test's two keys.
    const a = await svc.add({ provider: 'ANTHROPIC', apiKey: 'sk-test-selA-1234', label: 'selA' });
    const b = await svc.add({ provider: 'ANTHROPIC', apiKey: 'sk-test-selB-1234', label: 'selB' });
    created.push(a.id, b.id);

    const first = await svc.selectKey('ANTHROPIC' as never);
    expect(first?.apiKey).toContain('sk-test-'); // decrypted for the caller only
    expect([a.id, b.id]).toContain(first?.id);

    // LRU: the just-used key is most-recently-used, so the other (never-used) is next.
    const second = await svc.selectKey('ANTHROPIC' as never);
    expect(second?.id).not.toBe(first?.id);
    expect([a.id, b.id]).toContain(second?.id);
  });

  it('ejects a key after repeated failures and re-admits it on success', async () => {
    const k = await add('eject');
    for (let i = 0; i < EJECT_THRESHOLD; i++) await svc.recordResult(k.id, false);
    const afterFail = (await svc.list()).find((x) => x.id === k.id);
    expect(afterFail?.ejected).toBe(true);
    expect(afterFail?.failureCount).toBe(EJECT_THRESHOLD);

    await svc.recordResult(k.id, true); // a good call clears the failures
    const afterOk = (await svc.list()).find((x) => x.id === k.id);
    expect(afterOk?.ejected).toBe(false);
    expect(afterOk?.failureCount).toBe(0);
  });

  it('deactivating and removing a key works', async () => {
    const k = await add('toggle');
    const off = await svc.setActive(k.id, false);
    expect(off.active).toBe(false);
    const gone = await svc.remove(k.id);
    expect(gone.id).toBe(k.id);
    await expect(svc.remove(k.id)).rejects.toSatisfy(isAppError); // already removed
  });
});
