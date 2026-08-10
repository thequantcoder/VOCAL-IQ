import { describe, expect, it } from 'vitest';
import {
  EJECT_COOLDOWN_MS,
  EJECT_THRESHOLD,
  type KeyPoolEntry,
  isEjected,
  pickPoolKey,
  registerFailure,
  registerSuccess,
} from './key-pool.js';

const entry = (over: Partial<KeyPoolEntry>): KeyPoolEntry => ({
  id: 'a',
  weight: 1,
  active: true,
  failureCount: 0,
  lastFailureAt: null,
  lastUsedAt: null,
  ...over,
});

const NOW = 1_000_000_000;

describe('pickPoolKey (weighted LRU)', () => {
  it('returns null when the pool is empty or all inactive', () => {
    expect(pickPoolKey([], NOW)).toBeNull();
    expect(pickPoolKey([entry({ active: false })], NOW)).toBeNull();
  });

  it('prefers the least-recently-used key', () => {
    const a = entry({ id: 'a', lastUsedAt: NOW - 1_000 });
    const b = entry({ id: 'b', lastUsedAt: NOW - 10_000 }); // idler
    expect(pickPoolKey([a, b], NOW)?.id).toBe('b');
  });

  it('weights selection: a heavier key is chosen more often over a run', () => {
    let a = entry({ id: 'a', weight: 1, lastUsedAt: NOW });
    let b = entry({ id: 'b', weight: 3, lastUsedAt: NOW });
    const counts: Record<string, number> = { a: 0, b: 0 };
    let t = NOW;
    for (let i = 0; i < 40; i++) {
      t += 1_000;
      const pick = pickPoolKey([a, b], t);
      if (!pick) throw new Error('no key');
      counts[pick.id]++;
      const upd = { lastUsedAt: t };
      if (pick.id === 'a') a = { ...a, ...upd };
      else b = { ...b, ...upd };
    }
    expect(counts.b).toBeGreaterThan(counts.a); // weight 3 vs 1
  });
});

describe('ejection + health', () => {
  it('ejects after the failure threshold and re-admits after cooldown', () => {
    let e = entry({ id: 'a' });
    for (let i = 0; i < EJECT_THRESHOLD; i++) e = { ...e, ...registerFailure(e, NOW) };
    expect(e.failureCount).toBe(EJECT_THRESHOLD);
    expect(isEjected(e, NOW)).toBe(true);
    expect(pickPoolKey([e], NOW)).toBeNull(); // out of rotation

    // Still ejected inside the cooldown, eligible again once it passes (half-open re-probe).
    expect(isEjected(e, NOW + EJECT_COOLDOWN_MS - 1)).toBe(true);
    expect(isEjected(e, NOW + EJECT_COOLDOWN_MS)).toBe(false);
    expect(pickPoolKey([e], NOW + EJECT_COOLDOWN_MS)?.id).toBe('a');
  });

  it('a success resets the failure count (un-ejects)', () => {
    let e = entry({ id: 'a', failureCount: EJECT_THRESHOLD, lastFailureAt: NOW });
    expect(isEjected(e, NOW)).toBe(true);
    e = { ...e, ...registerSuccess(e, NOW + 1_000) };
    expect(e.failureCount).toBe(0);
    expect(isEjected(e, NOW + 1_000)).toBe(false);
  });

  it('routes around an ejected key to a healthy one', () => {
    const bad = entry({ id: 'bad', failureCount: EJECT_THRESHOLD, lastFailureAt: NOW });
    const good = entry({ id: 'good', lastUsedAt: NOW - 5_000 });
    expect(pickPoolKey([bad, good], NOW)?.id).toBe('good');
  });
});
