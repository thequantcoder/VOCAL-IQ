import { describe, expect, it } from 'vitest';
import {
  avatarInputSchema,
  clampSeconds,
  decideMode,
  estimateVideoCost,
  planAllowsVideoAvatar,
  requiresLikenessConsent,
} from './avatar.js';

describe('requiresLikenessConsent', () => {
  it('a custom avatar needs consent; a stock one does not', () => {
    expect(requiresLikenessConsent('custom')).toBe(true);
    expect(requiresLikenessConsent('stock')).toBe(false);
  });
});

describe('decideMode (graceful fallback — self-audit D/F)', () => {
  const ready = {
    requestVideo: true,
    planAllowsVideo: true,
    providerReady: true,
    avatarSelected: true,
  };
  it('runs video only when everything is present', () => {
    expect(decideMode(ready)).toEqual({ mode: 'video', fallback: false });
  });
  it('falls back to voice (never errors) when a piece is missing', () => {
    expect(decideMode({ ...ready, planAllowsVideo: false })).toEqual({
      mode: 'voice',
      fallback: true,
      reason: 'plan',
    });
    expect(decideMode({ ...ready, providerReady: false }).reason).toBe('provider_unavailable');
    expect(decideMode({ ...ready, avatarSelected: false }).reason).toBe('no_avatar');
  });
  it('honours an explicit voice request without a fallback flag', () => {
    expect(decideMode({ ...ready, requestVideo: false })).toEqual({
      mode: 'voice',
      fallback: false,
    });
  });
});

describe('estimateVideoCost + clampSeconds (self-audit D — video cost)', () => {
  it('meters video per second, rounds to cents, and is 0 for voice', () => {
    expect(estimateVideoCost('video', 60, 0.02)).toBe(1.2);
    expect(estimateVideoCost('voice', 6000, 0.02)).toBe(0); // voice fallback → no video cost
    expect(estimateVideoCost('video', -5)).toBe(0);
  });
  it('caps runaway seconds', () => {
    expect(estimateVideoCost('video', 999_999_999, 0.02)).toBe(
      estimateVideoCost('video', 4 * 60 * 60, 0.02),
    );
    expect(clampSeconds(4 * 60 * 60 - 1, 100)).toBe(4 * 60 * 60);
    expect(clampSeconds(0, -10)).toBe(0);
  });
});

describe('planAllowsVideoAvatar', () => {
  it('gates on the plan feature flag', () => {
    expect(planAllowsVideoAvatar({ videoAvatar: true })).toBe(true);
    expect(planAllowsVideoAvatar({ videoAvatar: false })).toBe(false);
    expect(planAllowsVideoAvatar({})).toBe(false);
  });
});

describe('avatarInputSchema', () => {
  it('defaults kind to stock and consent to false', () => {
    const a = avatarInputSchema.parse({ name: 'Ava', providerAvatarId: 'p1' });
    expect(a.kind).toBe('stock');
    expect(a.likenessConsent).toBe(false);
    expect(avatarInputSchema.safeParse({ providerAvatarId: 'p1' }).success).toBe(false); // name required
  });
});
