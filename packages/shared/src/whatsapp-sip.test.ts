import { describe, expect, it } from 'vitest';
import { parseWaMetaHeaders, waSipRequestUri } from './whatsapp-sip.js';

describe('parseWaMetaHeaders', () => {
  it('reads the x-wa-meta-* headers case-insensitively', () => {
    const parsed = parseWaMetaHeaders({
      'X-WA-Meta-WACID': 'wacid.abc',
      'x-wa-meta-user-id': 'u1',
      'X-Wa-Meta-Cta-Payload': 'intent=book_demo',
      'x-wa-meta-call-duration': '42',
      via: 'SIP/2.0/TLS host',
    });
    expect(parsed).toEqual({
      wacid: 'wacid.abc',
      userId: 'u1',
      ctaPayload: 'intent=book_demo',
      durationSec: 42,
    });
  });

  it('handles array header values + drops a bad duration', () => {
    const parsed = parseWaMetaHeaders({
      'x-wa-meta-wacid': ['wacid.1'],
      'x-wa-meta-call-duration': 'not-a-number',
    });
    expect(parsed.wacid).toBe('wacid.1');
    expect(parsed.durationSec).toBeUndefined();
  });

  it('returns an empty object when no meta headers are present', () => {
    expect(parseWaMetaHeaders({ via: 'x', from: 'y' })).toEqual({});
  });
});

describe('waSipRequestUri', () => {
  it('builds the transport=tls request URI for a business number', () => {
    expect(waSipRequestUri('+1 (631) 555-3601')).toBe('sip:+16315553601@wa.meta.vc;transport=tls');
  });
});
