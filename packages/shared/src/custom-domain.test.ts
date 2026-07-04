import { describe, expect, it } from 'vitest';
import { customDomainInputSchema, isValidHostname, normalizeHostname } from './custom-domain.js';

describe('customDomainInputSchema + isValidHostname', () => {
  it('accepts valid public domains', () => {
    for (const h of ['calls.acme.com', 'voice.reseller.co.uk', 'a-b.example.io']) {
      expect(customDomainInputSchema.parse({ hostname: h }).hostname).toBe(h);
      expect(isValidHostname(h)).toBe(true);
    }
  });
  it('rejects invalid / non-delegatable hosts', () => {
    for (const h of [
      'localhost',
      'app.localhost',
      'no-dot',
      'http://x.com',
      'x.com/path',
      '-bad.com',
      '192.168.0.1',
    ]) {
      expect(() => customDomainInputSchema.parse({ hostname: h })).toThrow();
    }
  });
  it('lowercases + trims on parse', () => {
    expect(customDomainInputSchema.parse({ hostname: '  Calls.ACME.com ' }).hostname).toBe(
      'calls.acme.com',
    );
  });
});

describe('normalizeHostname', () => {
  it('lowercases, strips www. and a trailing dot', () => {
    expect(normalizeHostname('WWW.Acme.com.')).toBe('acme.com');
    expect(normalizeHostname('calls.acme.com')).toBe('calls.acme.com');
  });
});
