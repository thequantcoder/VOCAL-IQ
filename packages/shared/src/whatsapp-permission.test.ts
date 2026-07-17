import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_MAX_CONNECTED_PER_DAY,
  WHATSAPP_TEMPORARY_PERMISSION_MS,
  canPlaceWhatsappCall,
  canSendWhatsappPermissionRequest,
  isWhatsappPermissionActive,
  whatsappTemporaryExpiry,
} from './whatsapp-permission.js';

const NOW = new Date('2026-07-17T12:00:00Z');
const base = {
  state: 'permanent' as const,
  connectedLast24h: 0,
  consecutiveUnanswered: 0,
};

describe('isWhatsappPermissionActive', () => {
  it('permanent is always active', () => {
    expect(isWhatsappPermissionActive('permanent', null, NOW)).toBe(true);
  });
  it('temporary is active only before expiry', () => {
    expect(isWhatsappPermissionActive('temporary', NOW.getTime() + 1000, NOW)).toBe(true);
    expect(isWhatsappPermissionActive('temporary', NOW.getTime() - 1000, NOW)).toBe(false);
    expect(isWhatsappPermissionActive('temporary', null, NOW)).toBe(false);
  });
  it('no_permission is never active', () => {
    expect(isWhatsappPermissionActive('no_permission', null, NOW)).toBe(false);
  });
});

describe('canPlaceWhatsappCall', () => {
  it('allows a permanent, in-limits call', () => {
    expect(canPlaceWhatsappCall(base, NOW)).toEqual({ allowed: true });
  });

  it('blocks DNC first', () => {
    expect(canPlaceWhatsappCall({ ...base, dnc: true }, NOW)).toEqual({
      allowed: false,
      reason: 'dnc',
    });
  });

  it('blocks a blocked business-number country', () => {
    for (const c of ['US', 'ca', 'EG', 'VN', 'NG']) {
      expect(canPlaceWhatsappCall({ ...base, businessCountry: c }, NOW).reason).toBe(
        'blocked_country',
      );
    }
    expect(canPlaceWhatsappCall({ ...base, businessCountry: 'GB' }, NOW).allowed).toBe(true);
  });

  it('blocks with no_permission / permission_expired', () => {
    expect(canPlaceWhatsappCall({ ...base, state: 'no_permission' }, NOW).reason).toBe(
      'no_permission',
    );
    expect(
      canPlaceWhatsappCall({ ...base, state: 'temporary', expiresAtMs: NOW.getTime() - 1 }, NOW)
        .reason,
    ).toBe('permission_expired');
    // A live temporary permission is allowed.
    expect(
      canPlaceWhatsappCall(
        { ...base, state: 'temporary', expiresAtMs: NOW.getTime() + 10_000 },
        NOW,
      ).allowed,
    ).toBe(true);
  });

  it('hard-stops before the 4th consecutive unanswered (auto-revoke)', () => {
    expect(canPlaceWhatsappCall({ ...base, consecutiveUnanswered: 2 }, NOW).allowed).toBe(true);
    expect(canPlaceWhatsappCall({ ...base, consecutiveUnanswered: 3 }, NOW)).toEqual({
      allowed: false,
      reason: 'unanswered_backoff',
    });
  });

  it('enforces the ≤100 connected/24h cap', () => {
    expect(
      canPlaceWhatsappCall({ ...base, connectedLast24h: WHATSAPP_MAX_CONNECTED_PER_DAY - 1 }, NOW)
        .allowed,
    ).toBe(true);
    expect(
      canPlaceWhatsappCall({ ...base, connectedLast24h: WHATSAPP_MAX_CONNECTED_PER_DAY }, NOW)
        .reason,
    ).toBe('daily_connected_cap');
  });
});

describe('canSendWhatsappPermissionRequest', () => {
  it('allows when under both caps', () => {
    expect(canSendWhatsappPermissionRequest({ sentLast24h: 0, sentLast7d: 1 }).allowed).toBe(true);
  });
  it('blocks the daily cap (1/24h)', () => {
    expect(canSendWhatsappPermissionRequest({ sentLast24h: 1, sentLast7d: 1 })).toEqual({
      allowed: false,
      reason: 'daily_request_cap',
    });
  });
  it('blocks the weekly cap (2/7d)', () => {
    expect(canSendWhatsappPermissionRequest({ sentLast24h: 0, sentLast7d: 2 })).toEqual({
      allowed: false,
      reason: 'weekly_request_cap',
    });
  });
});

describe('whatsappTemporaryExpiry', () => {
  it('uses Meta’s expiration_timestamp (seconds → ms) when given', () => {
    expect(whatsappTemporaryExpiry(1_700_000_000, NOW)).toBe(1_700_000_000_000);
  });
  it('defaults to now + 7 days when absent', () => {
    expect(whatsappTemporaryExpiry(undefined, NOW)).toBe(
      NOW.getTime() + WHATSAPP_TEMPORARY_PERMISSION_MS,
    );
  });
});
