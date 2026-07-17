import { describe, expect, it } from 'vitest';
import {
  WA_CALL_PAYLOAD_MAX,
  buildWhatsAppCallBrief,
  decodeWhatsAppCallPayload,
  encodeWhatsAppCallPayload,
  normalizeWaNumber,
  waCallDeepLink,
  whatsAppCallContextToVars,
} from './whatsapp-call-link.js';

describe('WhatsApp call-link payload convention', () => {
  it('round-trips a full context through encode → decode', () => {
    const ctx = {
      intent: 'book_demo',
      campaign: 'blackfriday',
      reference: 'ORD-123',
      custom: { tier: 'gold', region: 'us-east' },
    };
    const payload = encodeWhatsAppCallPayload(ctx);
    expect(decodeWhatsAppCallPayload(payload)).toEqual(ctx);
  });

  it('drops blank fields and namespaces custom keys as c.<key>', () => {
    const payload = encodeWhatsAppCallPayload({
      intent: '  ',
      reference: 'R1',
      custom: { a: '1' },
    });
    expect(payload).toContain('ref=R1');
    expect(payload).toContain('c.a=1');
    expect(payload).not.toContain('intent');
  });

  it('returns empty for an empty context and decodes it to {}', () => {
    expect(encodeWhatsAppCallPayload({})).toBe('');
    expect(decodeWhatsAppCallPayload('')).toEqual({});
  });

  it('rejects an over-long payload (Meta length cap)', () => {
    const big = 'x'.repeat(WA_CALL_PAYLOAD_MAX);
    expect(() => encodeWhatsAppCallPayload({ reference: big })).toThrow(/too long/);
  });

  it('tolerates garbage on decode', () => {
    expect(decodeWhatsAppCallPayload('not a real payload %%%')).toBeTypeOf('object');
  });
});

describe('waCallDeepLink', () => {
  it('normalizes the number and appends the encoded payload', () => {
    const payload = encodeWhatsAppCallPayload({ intent: 'sales', campaign: 'q3' });
    const link = waCallDeepLink('+1 (415) 555-0134', payload);
    expect(link.startsWith('https://wa.me/call/14155550134?biz_payload=')).toBe(true);
    // the payload survives URL-encoding → decoding
    const round = new URL(link).searchParams.get('biz_payload') ?? '';
    expect(decodeWhatsAppCallPayload(round)).toEqual({ intent: 'sales', campaign: 'q3' });
  });

  it('omits the query when there is no payload', () => {
    expect(waCallDeepLink('14155550134')).toBe('https://wa.me/call/14155550134');
  });

  it('normalizeWaNumber strips non-digits', () => {
    expect(normalizeWaNumber('+44 20 7946 0000')).toBe('442079460000');
  });
});

describe('whatsAppCallContextToVars', () => {
  it('flattens reserved + custom keys and drops blanks', () => {
    const vars = whatsAppCallContextToVars({
      intent: 'support',
      campaign: '  ',
      reference: 'ORD-9',
      custom: { tier: 'gold', region: '  ' },
    });
    expect(vars).toEqual({ intent: 'support', reference: 'ORD-9', tier: 'gold' });
  });

  it('is empty for an empty context', () => {
    expect(whatsAppCallContextToVars({})).toEqual({});
  });

  it('round-trips from a decoded payload', () => {
    const ctx = decodeWhatsAppCallPayload(
      encodeWhatsAppCallPayload({ intent: 'book_demo', custom: { plan: 'pro' } }),
    );
    expect(whatsAppCallContextToVars(ctx)).toEqual({ intent: 'book_demo', plan: 'pro' });
  });
});

describe('buildWhatsAppCallBrief', () => {
  it('renders a brief listing every present field', () => {
    const brief = buildWhatsAppCallBrief({
      intent: 'book_demo',
      campaign: 'q3',
      reference: 'ORD-1',
      custom: { plan: 'pro' },
    });
    expect(brief).toContain('Intent: book_demo');
    expect(brief).toContain('Campaign / source: q3');
    expect(brief).toContain('Reference (order/booking/lead id): ORD-1');
    expect(brief).toContain('plan: pro');
    expect(brief).toMatch(/Acknowledge it naturally/);
  });

  it('returns an empty string when there is no context (nothing to prepend)', () => {
    expect(buildWhatsAppCallBrief({})).toBe('');
    expect(buildWhatsAppCallBrief({ intent: '   ' })).toBe('');
  });
});
