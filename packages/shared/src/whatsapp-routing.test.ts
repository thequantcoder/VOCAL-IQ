import { describe, expect, it } from 'vitest';
import {
  type RoutePlanInput,
  chooseWhatsappRoute,
  isWhatsappRestrictionActive,
  shouldThrottleWhatsapp,
  whatsappPickupRate,
} from './whatsapp-routing.js';

const base: RoutePlanInput = {
  policy: 'whatsapp_if_permitted',
  isWhatsappUser: true,
  whatsappEnabled: true,
  whatsappRestricted: false,
  canCallAllowed: true,
};

describe('chooseWhatsappRoute', () => {
  it('routes WhatsApp when permitted', () => {
    expect(chooseWhatsappRoute(base)).toEqual({ channel: 'whatsapp', reason: 'permitted' });
  });

  it('falls back to PSTN for a non-WhatsApp user or when disabled', () => {
    expect(chooseWhatsappRoute({ ...base, isWhatsappUser: false }).channel).toBe('pstn');
    expect(chooseWhatsappRoute({ ...base, whatsappEnabled: false }).reason).toBe(
      'not_whatsapp_user',
    );
  });

  it('routes around an active restriction and a low-pickup throttle', () => {
    expect(chooseWhatsappRoute({ ...base, whatsappRestricted: true })).toEqual({
      channel: 'pstn',
      reason: 'whatsapp_restricted',
    });
    expect(chooseWhatsappRoute({ ...base, throttled: true }).reason).toBe('throttled_low_pickup');
  });

  it('never routes WhatsApp against the permission gate (keeps the gate reason)', () => {
    expect(
      chooseWhatsappRoute({ ...base, canCallAllowed: false, canCallReason: 'no_permission' }),
    ).toEqual({ channel: 'pstn', reason: 'no_permission' });
    expect(
      chooseWhatsappRoute({ ...base, canCallAllowed: false, canCallReason: 'blocked_country' })
        .reason,
    ).toBe('blocked_country');
    expect(
      chooseWhatsappRoute({ ...base, canCallAllowed: false, canCallReason: 'dnc' }).reason,
    ).toBe('dnc');
  });

  it('honors the tenant policy', () => {
    expect(chooseWhatsappRoute({ ...base, policy: 'pstn_preferred' })).toEqual({
      channel: 'pstn',
      reason: 'policy_pstn_preferred',
    });
    // cheapest compares per-minute cost.
    expect(
      chooseWhatsappRoute({
        ...base,
        policy: 'cheapest',
        whatsappCostPerMin: 0.1,
        pstnCostPerMin: 0.05,
      }),
    ).toEqual({ channel: 'pstn', reason: 'pstn_cheaper' });
    expect(
      chooseWhatsappRoute({
        ...base,
        policy: 'cheapest',
        whatsappCostPerMin: 0.02,
        pstnCostPerMin: 0.05,
      }).reason,
    ).toBe('whatsapp_cheaper');
  });
});

describe('pickup throttle', () => {
  it('computes the rate and needs a sample before throttling', () => {
    expect(whatsappPickupRate(3, 10)).toBeCloseTo(0.3, 6);
    expect(whatsappPickupRate(0, 0)).toBe(1); // no attempts → treat as healthy
    expect(shouldThrottleWhatsapp(0, 5)).toBe(false); // sample too small
    expect(shouldThrottleWhatsapp(1, 20)).toBe(true); // 5% pickup over 20 → throttle
    expect(shouldThrottleWhatsapp(15, 20)).toBe(false); // 75% pickup → healthy
  });
});

describe('isWhatsappRestrictionActive', () => {
  const now = new Date('2026-07-17T12:00:00Z');
  it('is inactive without a restriction', () => {
    expect(isWhatsappRestrictionActive(null, now)).toBe(false);
    expect(isWhatsappRestrictionActive({ type: '' }, now)).toBe(false);
  });
  it('respects the expiry', () => {
    expect(
      isWhatsappRestrictionActive({ type: 'RESTRICTED_X', expiresAt: '2026-07-18T00:00:00Z' }, now),
    ).toBe(true);
    expect(
      isWhatsappRestrictionActive({ type: 'RESTRICTED_X', expiresAt: '2026-07-17T00:00:00Z' }, now),
    ).toBe(false);
    expect(isWhatsappRestrictionActive({ type: 'RESTRICTED_X' }, now)).toBe(true); // no expiry → active
  });
});
