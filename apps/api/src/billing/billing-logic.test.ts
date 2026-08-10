import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { nextDunningState } from './dunning';
import { overageCents, prorationCents } from './proration';
import { mapEventToStatus, verifyStripeSignature } from './stripe-webhook';

const SECRET = 'whsec_test_secret';

function sign(payload: string, t: number, secret = SECRET): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('verifyStripeSignature (self-audit C)', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
  const now = 1_700_000_000;

  it('accepts a correctly signed, fresh payload', () => {
    expect(verifyStripeSignature(payload, sign(payload, now), SECRET, { nowSec: now })).toEqual({
      ok: true,
    });
  });

  it('rejects a tampered payload', () => {
    const header = sign(payload, now);
    const res = verifyStripeSignature(`${payload} `, header, SECRET, { nowSec: now });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('signature mismatch');
  });

  it('rejects the wrong secret', () => {
    const header = sign(payload, now, 'whsec_other');
    expect(verifyStripeSignature(payload, header, SECRET, { nowSec: now }).ok).toBe(false);
  });

  it('rejects a stale timestamp (replay)', () => {
    const header = sign(payload, now - 10_000);
    const res = verifyStripeSignature(payload, header, SECRET, { nowSec: now });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('timestamp outside tolerance');
  });

  it('rejects a missing/malformed header', () => {
    expect(verifyStripeSignature(payload, undefined, SECRET).ok).toBe(false);
    expect(verifyStripeSignature(payload, 'garbage', SECRET).ok).toBe(false);
  });
});

describe('mapEventToStatus', () => {
  it('maps the events we act on', () => {
    expect(mapEventToStatus('invoice.paid')).toBe('ACTIVE');
    expect(mapEventToStatus('invoice.payment_failed')).toBe('PAST_DUE');
    expect(mapEventToStatus('customer.subscription.deleted')).toBe('CANCELLED');
    expect(mapEventToStatus('customer.subscription.updated')).toBeNull();
  });
});

describe('prorationCents', () => {
  it('charges the difference pro-rated by days remaining', () => {
    // Upgrade Free(0)→Pro(9900) with half the period left → charge ~half.
    expect(
      prorationCents({
        oldMonthlyCents: 0,
        newMonthlyCents: 9900,
        daysRemaining: 15,
        daysInPeriod: 30,
      }),
    ).toBe(4950);
  });

  it('credits on a downgrade', () => {
    expect(
      prorationCents({
        oldMonthlyCents: 9900,
        newMonthlyCents: 0,
        daysRemaining: 15,
        daysInPeriod: 30,
      }),
    ).toBe(-4950);
  });

  it('is zero with no days left', () => {
    expect(
      prorationCents({
        oldMonthlyCents: 9900,
        newMonthlyCents: 4900,
        daysRemaining: 0,
        daysInPeriod: 30,
      }),
    ).toBe(0);
  });
});

describe('overageCents', () => {
  it('charges only minutes beyond included', () => {
    expect(overageCents({ usedMinutes: 45, includedMinutes: 30, overageRatePerMinCents: 25 })).toBe(
      375,
    );
    expect(overageCents({ usedMinutes: 20, includedMinutes: 30, overageRatePerMinCents: 25 })).toBe(
      0,
    );
  });
});

describe('nextDunningState', () => {
  it('goes PAST_DUE and emails on the first failure', () => {
    expect(nextDunningState({ status: 'ACTIVE', failedAttempts: 0 }, 'payment_failed')).toEqual({
      status: 'PAST_DUE',
      failedAttempts: 1,
      action: 'send_dunning_email',
    });
  });

  it('suspends (CANCELLED) once retries are exhausted', () => {
    expect(
      nextDunningState({ status: 'PAST_DUE', failedAttempts: 2, maxRetries: 3 }, 'payment_failed'),
    ).toEqual({
      status: 'CANCELLED',
      failedAttempts: 3,
      action: 'suspend',
    });
  });

  it('reactivates on a successful payment', () => {
    expect(
      nextDunningState({ status: 'PAST_DUE', failedAttempts: 2 }, 'payment_succeeded'),
    ).toEqual({
      status: 'ACTIVE',
      failedAttempts: 0,
      action: 'reactivate',
    });
  });
});
