import { describe, expect, it } from 'vitest';
import { messageCostUsd } from './messaging.js';
import {
  type CascadePolicy,
  RcsCapabilityCache,
  planCascade,
  richMessageSchema,
  richMessageToText,
  runCascade,
} from './rcs.js';

/** GME-11: rich RCS core — validation, text fallback, cascade decision + runner, capability cache. */

const policy = (over: Partial<CascadePolicy> = {}): CascadePolicy => ({
  preferRcs: true,
  fallbackChannels: ['SMS'],
  ...over,
});

describe('richMessageSchema', () => {
  it('accepts each rich kind + applies defaults', () => {
    expect(richMessageSchema.parse({ kind: 'text', text: 'hi' }).suggestions).toEqual([]);
    const card = richMessageSchema.parse({ kind: 'card', card: { title: 'T' } });
    expect(card.kind === 'card' && card.orientation).toBe('VERTICAL');
    const car = richMessageSchema.parse({
      kind: 'carousel',
      cards: [{ title: 'A' }, { title: 'B' }],
    });
    expect(car.kind === 'carousel' && car.cardWidth).toBe('MEDIUM');
    expect(
      richMessageSchema.parse({ kind: 'media', media: { fileUrl: 'https://x.test/a.jpg' } }).kind,
    ).toBe('media');
  });

  it('rejects malformed rich messages', () => {
    expect(() =>
      richMessageSchema.parse({ kind: 'carousel', cards: [{ title: 'only one' }] }),
    ).toThrow(); // <2 cards
    expect(() => richMessageSchema.parse({ kind: 'card', card: {} })).toThrow(); // empty card
    expect(() =>
      richMessageSchema.parse({
        kind: 'text',
        text: 'hi',
        suggestions: [{ type: 'reply', text: 'x'.repeat(26) }],
      }),
    ).toThrow(); // chip label too long
    expect(() => richMessageSchema.parse({ kind: 'nope' })).toThrow(); // unknown kind
  });
});

describe('richMessageToText', () => {
  it('flattens a text message with suggestion chips', () => {
    const t = richMessageToText({
      kind: 'text',
      text: 'Your order shipped',
      suggestions: [
        { type: 'reply', text: 'Track' },
        { type: 'action', text: 'Open', openUrl: 'https://x.test/track' },
      ],
    });
    expect(t).toContain('Your order shipped');
    expect(t).toContain('• Track');
    expect(t).toContain('Open: https://x.test/track');
  });

  it('flattens a card (title + description + suggestion)', () => {
    const t = richMessageToText({
      kind: 'card',
      card: {
        title: 'Weekend Sale',
        description: '20% off',
        suggestions: [{ type: 'action', text: 'Call', dialNumber: '+18005550100' }],
      },
      orientation: 'VERTICAL',
    });
    expect(t).toContain('Weekend Sale');
    expect(t).toContain('20% off');
    expect(t).toContain('Call: +18005550100');
  });

  it('numbers carousel cards', () => {
    const t = richMessageToText({
      kind: 'carousel',
      cards: [{ title: 'Plan A' }, { title: 'Plan B' }],
      cardWidth: 'MEDIUM',
    });
    expect(t).toContain('(1/2)');
    expect(t).toContain('Plan A');
    expect(t).toContain('(2/2)');
    expect(t).toContain('Plan B');
  });

  it('includes the media url', () => {
    const t = richMessageToText({
      kind: 'media',
      media: { fileUrl: 'https://x.test/promo.png', height: 'MEDIUM' },
      text: 'Look',
    });
    expect(t).toContain('Look');
    expect(t).toContain('https://x.test/promo.png');
  });
});

describe('planCascade', () => {
  it('leads with RCS when the recipient is capable and the policy prefers it', () => {
    expect(planCascade(true, policy())).toEqual(['RCS', 'SMS']);
    expect(planCascade(true, policy({ fallbackChannels: ['WHATSAPP', 'SMS'] }))).toEqual([
      'RCS',
      'WHATSAPP',
      'SMS',
    ]);
  });

  it('skips RCS for a non-capable recipient or when preferRcs is off', () => {
    expect(planCascade(false, policy())).toEqual(['SMS']);
    expect(planCascade(true, policy({ preferRcs: false }))).toEqual(['SMS']);
  });
});

describe('runCascade', () => {
  it('uses the first channel that succeeds — no fallback flags', async () => {
    const out = await runCascade(['RCS', 'SMS'], async (ch) => ({
      ok: ch === 'RCS',
      providerMessageId: 'r1',
    }));
    expect(out.channelUsed).toBe('RCS');
    expect(out.providerMessageId).toBe('r1');
    expect(out.fallbackFrom).toBeUndefined();
    expect(out.attempts).toHaveLength(1);
  });

  it('falls back to SMS when RCS fails and records the provenance', async () => {
    const out = await runCascade(['RCS', 'SMS'], async (ch) => ({
      ok: ch === 'SMS',
      providerMessageId: ch === 'SMS' ? 's1' : undefined,
      error: ch === 'RCS' ? 'not capable' : undefined,
    }));
    expect(out.channelUsed).toBe('SMS');
    expect(out.fallbackFrom).toBe('RCS');
    expect(out.fallbackTo).toBe('SMS');
    expect(out.attempts).toHaveLength(2);
    expect(out.attempts[0]).toMatchObject({ channel: 'RCS', ok: false });
  });

  it('returns channelUsed=null when every channel fails, and treats a throw as a failed attempt', async () => {
    const out = await runCascade(['RCS', 'SMS'], async (ch) => {
      if (ch === 'RCS') throw new Error('boom');
      return { ok: false, error: 'nope' };
    });
    expect(out.channelUsed).toBeNull();
    expect(out.attempts).toHaveLength(2);
    expect(out.attempts[0]).toMatchObject({ channel: 'RCS', ok: false, error: 'boom' });
  });
});

describe('RcsCapabilityCache', () => {
  it('caches capability and expires it past the TTL', () => {
    let t = 1000;
    const cache = new RcsCapabilityCache(500, () => t);
    expect(cache.get('+911')).toBeUndefined(); // miss
    cache.set('+911', true);
    expect(cache.get('+911')).toBe(true);
    t += 600; // past TTL
    expect(cache.get('+911')).toBeUndefined();
  });
});

describe('cost differs by resolved channel', () => {
  it('an RCS send and its SMS fallback are not the same price', () => {
    const text = 'Your order shipped — track it here';
    expect(messageCostUsd('RCS', text)).not.toBe(messageCostUsd('SMS', text));
  });
});
