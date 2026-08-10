import { describe, expect, it } from 'vitest';
import {
  isExpired,
  luhnValid,
  phoneKey,
  redactPii,
  redactSegments,
  requiresDisclosure,
  retentionPolicySchema,
  stripCardData,
} from './compliance.js';

describe('luhnValid', () => {
  it('accepts a valid card number and rejects an invalid one', () => {
    expect(luhnValid('4242 4242 4242 4242')).toBe(true); // Stripe test Visa
    expect(luhnValid('1234 5678 9012 3456')).toBe(false);
  });
});

describe('redactPii (effectiveness — self-audit C)', () => {
  it('redacts card, ssn, email, and phone', () => {
    const input =
      'Call me at (415) 555-0132 or email a@b.com. SSN 123-45-6789 card 4242424242424242.';
    const { text, counts } = redactPii(input);
    expect(text).not.toContain('4242424242424242');
    expect(text).not.toContain('a@b.com');
    expect(text).not.toContain('123-45-6789');
    expect(text).not.toContain('555-0132');
    expect(counts.card).toBe(1);
    expect(counts.email).toBe(1);
    expect(counts.ssn).toBe(1);
    expect(counts.phone).toBe(1);
    expect(text).toContain('[REDACTED:card]');
  });

  it('does not redact a random long digit run that fails Luhn', () => {
    const { counts } = redactPii('order number 1234567890123456', ['card']);
    expect(counts.card).toBe(0);
  });
});

describe('stripCardData (PCI-safe capture)', () => {
  it('removes ONLY the card number, leaving other text', () => {
    const out = stripCardData('my card is 4242 4242 4242 4242 thanks');
    expect(out).not.toContain('4242');
    expect(out).toContain('my card is');
    expect(out).toContain('thanks');
  });
});

describe('redactSegments', () => {
  it('redacts across segments and sums counts', () => {
    const segs = [
      { who: 'caller', text: 'email me a@b.com' },
      { who: 'agent', text: 'ok, card 4242424242424242' },
    ];
    const { segments, counts } = redactSegments(segs);
    expect(segments[0]?.text).toContain('[REDACTED:email]');
    expect(segments[1]?.text).not.toContain('4242424242424242');
    expect(counts.email).toBe(1);
    expect(counts.card).toBe(1);
  });
});

describe('requiresDisclosure (region-aware)', () => {
  it('is true for two-party regions, false otherwise', () => {
    expect(requiresDisclosure('US-CA')).toBe(true);
    expect(requiresDisclosure('eu')).toBe(true);
    expect(requiresDisclosure('US-TX')).toBe(false);
  });
});

describe('phoneKey', () => {
  it('normalizes NANP numbers to a comparison key', () => {
    expect(phoneKey('(415) 555-0132')).toBe('14155550132');
    expect(phoneKey('+1 415 555 0132')).toBe('14155550132');
  });
});

describe('isExpired + retentionPolicySchema', () => {
  const now = new Date('2026-07-04T00:00:00Z');
  it('0 days never expires; otherwise expires past the window', () => {
    const old = new Date('2026-01-01T00:00:00Z');
    expect(isExpired(old, 0, now)).toBe(false);
    expect(isExpired(old, 30, now)).toBe(true);
    expect(isExpired(new Date('2026-07-01T00:00:00Z'), 30, now)).toBe(false);
  });
  it('defaults to keep-forever', () => {
    const p = retentionPolicySchema.parse({});
    expect(p.recordingsDays).toBe(0);
    expect(p.redactTranscripts).toBe(false);
  });
});
