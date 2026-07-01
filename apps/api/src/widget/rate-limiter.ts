/**
 * Fixed-window rate limiter for the public widget session endpoint (self-audit focus C —
 * abuse control on an unauthenticated route). Keyed per caller (ip+agent); in-memory
 * (single node) with an injected clock for deterministic tests. A Redis-backed limiter
 * replaces it at scale.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Record a hit for `key`; return true if within the limit, false if it should be rejected. */
  hit(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || t >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }
}
