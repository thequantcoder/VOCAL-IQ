import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  it('allows up to max within the window, then rejects', () => {
    let now = 1000;
    const rl = new RateLimiter(3, 60_000, () => now);
    expect(rl.hit('k')).toBe(true);
    expect(rl.hit('k')).toBe(true);
    expect(rl.hit('k')).toBe(true);
    expect(rl.hit('k')).toBe(false); // 4th in window
    now += 60_000; // window rolls over
    expect(rl.hit('k')).toBe(true);
  });

  it('tracks keys independently', () => {
    const rl = new RateLimiter(1, 60_000, () => 0);
    expect(rl.hit('a')).toBe(true);
    expect(rl.hit('a')).toBe(false);
    expect(rl.hit('b')).toBe(true);
  });
});
