import { describe, expect, it } from 'vitest';
import {
  MESSENGER_CALL_PAYLOAD_MAX,
  buildMessengerCallBrief,
  decodeMessengerCallContext,
  encodeMessengerCallContext,
  fromMessengerCallRef,
  mMeLink,
  messengerCallContextToVars,
  messengerCallLink,
  normalizeMessengerPage,
  toMessengerCallRef,
} from './messenger-call-link.js';

describe('messenger-call-link — context payload (internal form)', () => {
  it('encodes / decodes a full context round-trip', () => {
    const ctx = {
      intent: 'book_demo',
      campaign: 'launch',
      reference: 'lead_42',
      custom: { plan: 'pro', seats: '5' },
    };
    const encoded = encodeMessengerCallContext(ctx);
    expect(decodeMessengerCallContext(encoded)).toEqual(ctx);
  });

  it('drops empty fields and returns "" for an empty context', () => {
    expect(encodeMessengerCallContext({})).toBe('');
    expect(encodeMessengerCallContext({ intent: '   ' })).toBe('');
  });

  it('throws when the payload would exceed the max length', () => {
    const huge = 'x'.repeat(MESSENGER_CALL_PAYLOAD_MAX + 10);
    expect(() => encodeMessengerCallContext({ custom: { big: huge } })).toThrow(/too long/);
  });
});

describe('messenger-call-link — wire ref (base64url, m.me-charset-safe)', () => {
  it('round-trips a context through the ref token', () => {
    const ctx = { intent: 'support', reference: 'order#9 & co', custom: { note: 'a=b c/d' } };
    const ref = toMessengerCallRef(ctx);
    expect(fromMessengerCallRef(ref)).toEqual(ctx);
  });

  it('produces a ref valid under Metas restricted m.me charset even for hostile values', () => {
    // Values with &, %, spaces, ? would break a raw query-string ref — base64url keeps it safe.
    const ref = toMessengerCallRef({
      intent: 'a & b',
      campaign: '100% off?',
      custom: { q: 'x=y&z=1 2 3' },
    });
    expect(ref).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('empty context → empty ref; empty/garbage ref → empty context', () => {
    expect(toMessengerCallRef({})).toBe('');
    expect(fromMessengerCallRef('')).toEqual({});
    expect(fromMessengerCallRef('   ')).toEqual({});
  });
});

describe('messenger-call-link — m.me links', () => {
  it('normalizes a Page handle from many forms', () => {
    expect(normalizeMessengerPage('mypage')).toBe('mypage');
    expect(normalizeMessengerPage('@mypage')).toBe('mypage');
    expect(normalizeMessengerPage('https://m.me/mypage')).toBe('mypage');
    expect(normalizeMessengerPage('https://www.facebook.com/mypage')).toBe('mypage');
    expect(normalizeMessengerPage('102345678901234')).toBe('102345678901234');
    expect(normalizeMessengerPage('https://m.me/mypage?ref=abc')).toBe('mypage');
  });

  it('builds a base m.me link and a ref-carrying call link', () => {
    expect(mMeLink('mypage')).toBe('https://m.me/mypage');
    expect(messengerCallLink('mypage')).toBe('https://m.me/mypage');
    const link = messengerCallLink('@mypage', { intent: 'support' });
    expect(link.startsWith('https://m.me/mypage?ref=')).toBe(true);
    const ref = link.split('?ref=')[1] ?? '';
    expect(fromMessengerCallRef(ref)).toEqual({ intent: 'support' });
  });
});

describe('messenger-call-link — agent runtime helpers', () => {
  it('flattens context into flow variables (empty fields dropped)', () => {
    expect(
      messengerCallContextToVars({ intent: 'support', reference: '', custom: { a: '1', b: ' ' } }),
    ).toEqual({ intent: 'support', a: '1' });
  });

  it('builds a natural-language brief, "" when empty', () => {
    expect(buildMessengerCallBrief({})).toBe('');
    const brief = buildMessengerCallBrief({ intent: 'book_demo', campaign: 'launch' });
    expect(brief).toContain('Intent: book_demo');
    expect(brief).toContain('Campaign / source: launch');
  });
});
