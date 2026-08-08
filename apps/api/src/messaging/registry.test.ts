import { describe, expect, it } from 'vitest';
import { MessagingRegistry, buildRegistry } from './registry';
import type { MessageSender, SendResult } from './senders';

/** GME-00: the messaging provider registry — grouping, defaults, id lookup, and gated build. */

const sent = async (): Promise<SendResult> => ({ status: 'SENT' });
const provider = (id: string, channel: MessageSender['channel']): MessageSender => ({
  id,
  channel,
  send: sent,
});

describe('MessagingRegistry', () => {
  it('groups providers by channel and preserves registration order', () => {
    const a = provider('twilio', 'SMS');
    const b = provider('msg91', 'SMS');
    const w = provider('whatsapp-cloud', 'WHATSAPP');
    const reg = new MessagingRegistry([a, b, w]);

    expect(reg.forChannel('SMS')).toEqual([a, b]);
    expect(reg.forChannel('WHATSAPP')).toEqual([w]);
    expect(reg.forChannel('RCS')).toEqual([]);
  });

  it('default() returns the first provider for a channel (behaviour-preserving), undefined if none', () => {
    const a = provider('twilio', 'SMS');
    const b = provider('msg91', 'SMS');
    const reg = new MessagingRegistry([a, b]);
    expect(reg.default('SMS')).toBe(a);
    expect(reg.default('RCS')).toBeUndefined();
  });

  it('byId() resolves a specific provider; channels()/providerIds() enumerate config', () => {
    const a = provider('twilio', 'SMS');
    const w = provider('whatsapp-cloud', 'WHATSAPP');
    const reg = new MessagingRegistry([a, w]);
    expect(reg.byId('twilio')).toBe(a);
    expect(reg.byId('nope')).toBeUndefined();
    expect(reg.channels().sort()).toEqual(['SMS', 'WHATSAPP']);
    expect(reg.providerIds().sort()).toEqual(['twilio', 'whatsapp-cloud']);
  });

  it('fromSenders() ignores unconfigured (undefined) channels', () => {
    const a = provider('twilio', 'SMS');
    const reg = MessagingRegistry.fromSenders({ SMS: a, WHATSAPP: undefined });
    expect(reg.providerIds()).toEqual(['twilio']);
    expect(reg.default('WHATSAPP')).toBeUndefined();
  });
});

describe('buildRegistry (gated)', () => {
  it('is empty with no credentials set', () => {
    expect(buildRegistry({} as NodeJS.ProcessEnv).providerIds()).toEqual([]);
  });

  it('builds only channels whose credentials are configured, with stable provider ids', () => {
    const reg = buildRegistry({
      TWILIO_ACCOUNT_SID: 'AC',
      TWILIO_AUTH_TOKEN: 'tok',
      TWILIO_MESSAGING_FROM: '+15550000000',
      RCS_API_URL: 'https://rcs/send',
      RCS_API_TOKEN: 'rt',
    } as NodeJS.ProcessEnv);
    expect(reg.default('SMS')?.id).toBe('twilio');
    expect(reg.default('RCS')?.id).toBe('rcs-gateway');
    expect(reg.default('WHATSAPP')).toBeUndefined(); // gated — no creds
  });
});
