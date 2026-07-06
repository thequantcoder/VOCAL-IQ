import { describe, expect, it } from 'vitest';
import {
  buildDisclosure,
  callingAllowed,
  disclosureConfigSchema,
  frequencyAllowed,
  isWithinCallingHours,
  rulesForRegion,
} from './ai-disclosure.js';

describe('rulesForRegion', () => {
  it('resolves a template key, a region code, else default', () => {
    expect(rulesForRegion('US-TCPA').disclosureRequired).toBe(true);
    expect(rulesForRegion('EU').maxAttemptsPerDay).toBe(2);
    expect(rulesForRegion('ZZ').disclosureRequired).toBe(false); // default
    expect(rulesForRegion(null).region).toBe('DEFAULT');
  });
});

describe('buildDisclosure', () => {
  const cfg = disclosureConfigSchema.parse({ region: 'US-TCPA' });
  it('speaks an AI disclosure + the human opt-out where required', () => {
    const line = buildDisclosure(cfg, 'Ava', 'Acme');
    expect(line).toContain('AI assistant');
    expect(line).toContain('Acme');
    expect(line).toContain('press 1');
    expect(line).toContain('human');
  });
  it('returns null when disclosure is not required and there is no custom text', () => {
    expect(buildDisclosure(disclosureConfigSchema.parse({ region: 'DEFAULT' }), 'Ava')).toBeNull();
  });
  it('uses custom text when provided', () => {
    const line = buildDisclosure(
      disclosureConfigSchema.parse({ region: 'DEFAULT', customText: 'Automated call from Acme.' }),
      'Ava',
    );
    expect(line).toBe('Automated call from Acme.');
  });
});

describe('calling hours + frequency', () => {
  it('enforces the region calling window', () => {
    expect(isWithinCallingHours('US-TCPA', 10)).toBe(true); // 8–21
    expect(isWithinCallingHours('US-TCPA', 7)).toBe(false);
    expect(isWithinCallingHours('US-TCPA', 21)).toBe(false); // exclusive end
    expect(isWithinCallingHours('EU', 20)).toBe(false); // EU 9–20
  });
  it('enforces the frequency cap', () => {
    expect(frequencyAllowed('US-TCPA', 2)).toBe(true); // cap 3
    expect(frequencyAllowed('US-TCPA', 3)).toBe(false);
  });
});

describe('callingAllowed (the outbound gate)', () => {
  it('allows inside hours + under the cap', () => {
    expect(callingAllowed('US-TCPA', { localHour: 12, attemptsToday: 1 }).allowed).toBe(true);
  });
  it('blocks out-of-hours with a reason', () => {
    const r = callingAllowed('US-TCPA', { localHour: 6, attemptsToday: 0 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('calling hours');
  });
  it('blocks over the frequency cap', () => {
    const r = callingAllowed('US-TCPA', { localHour: 12, attemptsToday: 5 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('frequency');
  });
});
