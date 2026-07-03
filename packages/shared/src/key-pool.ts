/**
 * Platform API key-pool load balancing (Day 38, Blueprint §4.5). Managed mode can hold
 * several keys per provider (`PlatformApiKeyPool`) to sustain concurrency and dodge
 * per-key rate limits. This module is the PURE selection + health logic: given the pool's
 * current state it picks the next key (weighted, least-recently-used) and tracks failures
 * so a bad key is ejected and later re-probed. No DB/crypto here — the api service persists
 * the `lastUsedAt` / `failureCount` fields this returns.
 */

/** Consecutive failures before a key is ejected from rotation. */
export const EJECT_THRESHOLD = 3;
/** How long an ejected key stays out before it's eligible for a single re-probe. */
export const EJECT_COOLDOWN_MS = 5 * 60_000;

export interface KeyPoolEntry {
  id: string;
  /** Relative selection weight (higher = more traffic). */
  weight: number;
  /** Admin on/off switch. */
  active: boolean;
  /** Consecutive failures since the last success. */
  failureCount: number;
  /** Epoch ms of the last failure (null = never). */
  lastFailureAt: number | null;
  /** Epoch ms of the last selection (null = never used). */
  lastUsedAt: number | null;
}

/**
 * Is this key currently ejected? A key trips ejection once it hits EJECT_THRESHOLD
 * consecutive failures, and stays ejected until EJECT_COOLDOWN_MS has passed since its
 * last failure (then it gets one half-open re-probe). Inactive keys are never eligible.
 */
export function isEjected(entry: KeyPoolEntry, now: number): boolean {
  if (entry.failureCount < EJECT_THRESHOLD) return false;
  if (entry.lastFailureAt === null) return false;
  return now - entry.lastFailureAt < EJECT_COOLDOWN_MS;
}

/** Keys eligible for selection right now: active and not ejected. */
export function healthyKeys(entries: KeyPoolEntry[], now: number): KeyPoolEntry[] {
  return entries.filter((e) => e.active && !isEjected(e, now));
}

/**
 * Pick the next key: weighted least-recently-used. Each key's score is its idle time
 * scaled by weight (`(now - lastUsedAt) * weight`), so a never-used key wins first and a
 * weight-2 key is chosen roughly twice as often as a weight-1 key. Deterministic (ties
 * broken by id) so it's testable and stable under replay. Returns null if none are healthy.
 */
export function pickPoolKey(entries: KeyPoolEntry[], now: number): KeyPoolEntry | null {
  const healthy = healthyKeys(entries, now);
  if (healthy.length === 0) return null;

  let best: KeyPoolEntry | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const e of healthy) {
    const idle = now - (e.lastUsedAt ?? 0);
    const score = idle * Math.max(1, e.weight);
    if (score > bestScore || (score === bestScore && best && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/** New health fields after a successful call: failures reset, marked used now. */
export function registerSuccess(_entry: KeyPoolEntry, now: number): Partial<KeyPoolEntry> {
  return { failureCount: 0, lastFailureAt: null, lastUsedAt: now };
}

/** New health fields after a failed call: failure count incremented, stamped now. */
export function registerFailure(entry: KeyPoolEntry, now: number): Partial<KeyPoolEntry> {
  return { failureCount: entry.failureCount + 1, lastFailureAt: now, lastUsedAt: now };
}
