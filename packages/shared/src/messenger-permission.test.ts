import { describe, expect, it } from 'vitest';
import {
  MESSENGER_UNANSWERED_BACKOFF,
  canPlaceMessengerCall,
  isMessengerPermissionActive,
  messengerOutboundBlockedMessage,
} from './messenger-permission.js';

const NOW = new Date('2026-07-19T12:00:00Z');
const NOW_SEC = Math.floor(NOW.getTime() / 1000);

const base = {
  status: 'permanent' as const,
  consecutiveUnanswered: 0,
};

describe('isMessengerPermissionActive', () => {
  it('permanent is always active', () => {
    expect(isMessengerPermissionActive('permanent', null, NOW)).toBe(true);
  });
  it('no_permission is never active', () => {
    expect(isMessengerPermissionActive('no_permission', NOW_SEC + 9999, NOW)).toBe(false);
  });
  it('temporary is active only before its epoch-seconds expiry', () => {
    expect(isMessengerPermissionActive('temporary', NOW_SEC + 60, NOW)).toBe(true);
    expect(isMessengerPermissionActive('temporary', NOW_SEC - 60, NOW)).toBe(false);
    expect(isMessengerPermissionActive('temporary', null, NOW)).toBe(false);
    expect(isMessengerPermissionActive('temporary', undefined, NOW)).toBe(false);
  });
});

describe('canPlaceMessengerCall', () => {
  it('allows a permanent, in-limits, answered contact', () => {
    expect(canPlaceMessengerCall(base, NOW)).toEqual({ allowed: true });
  });

  it('blocks DNC before anything else (even with permission)', () => {
    expect(canPlaceMessengerCall({ ...base, dnc: true }, NOW)).toEqual({
      allowed: false,
      reason: 'dnc',
    });
  });

  it('blocks no_permission', () => {
    expect(canPlaceMessengerCall({ ...base, status: 'no_permission' }, NOW)).toEqual({
      allowed: false,
      reason: 'no_permission',
    });
  });

  it('blocks an expired temporary permission with permission_expired', () => {
    expect(
      canPlaceMessengerCall({ ...base, status: 'temporary', expiresAtSec: NOW_SEC - 1 }, NOW),
    ).toEqual({ allowed: false, reason: 'permission_expired' });
  });

  it('allows a live temporary permission', () => {
    expect(
      canPlaceMessengerCall({ ...base, status: 'temporary', expiresAtSec: NOW_SEC + 1000 }, NOW),
    ).toEqual({ allowed: true });
  });

  it('blocks at the consecutive-unanswered back-off (no country rule exists)', () => {
    expect(
      canPlaceMessengerCall({ ...base, consecutiveUnanswered: MESSENGER_UNANSWERED_BACKOFF }, NOW),
    ).toEqual({ allowed: false, reason: 'unanswered_backoff' });
    // one below the threshold is still allowed
    expect(
      canPlaceMessengerCall(
        { ...base, consecutiveUnanswered: MESSENGER_UNANSWERED_BACKOFF - 1 },
        NOW,
      ),
    ).toEqual({ allowed: true });
  });

  it('honours Meta’s live verdict: callActionAllowed=false → rate_limited', () => {
    expect(canPlaceMessengerCall({ ...base, callActionAllowed: false }, NOW)).toEqual({
      allowed: false,
      reason: 'rate_limited',
    });
  });

  it('enforces the numeric limit only when maxAllowed > 0', () => {
    expect(
      canPlaceMessengerCall({ ...base, callActionLimit: { maxAllowed: 5, currentUsage: 5 } }, NOW),
    ).toEqual({ allowed: false, reason: 'rate_limited' });
    // usage below cap → allowed
    expect(
      canPlaceMessengerCall({ ...base, callActionLimit: { maxAllowed: 5, currentUsage: 4 } }, NOW),
    ).toEqual({ allowed: true });
    // maxAllowed=0 means "no cap reported" (adapter default), not "zero allowed"
    expect(
      canPlaceMessengerCall({ ...base, callActionLimit: { maxAllowed: 0, currentUsage: 3 } }, NOW),
    ).toEqual({ allowed: true });
  });

  it('permission is checked before the back-off and rate limit', () => {
    expect(
      canPlaceMessengerCall(
        {
          status: 'no_permission',
          consecutiveUnanswered: 99,
          callActionAllowed: false,
          dnc: false,
        },
        NOW,
      ),
    ).toEqual({ allowed: false, reason: 'no_permission' });
  });
});

describe('messengerOutboundBlockedMessage', () => {
  it('maps every reason to a distinct operator-facing message', () => {
    const reasons = [
      'dnc',
      'no_permission',
      'permission_expired',
      'unanswered_backoff',
      'rate_limited',
    ] as const;
    const msgs = reasons.map((r) => messengerOutboundBlockedMessage(r));
    expect(new Set(msgs).size).toBe(reasons.length);
    expect(messengerOutboundBlockedMessage(undefined)).toMatch(/not permitted/i);
  });
});
