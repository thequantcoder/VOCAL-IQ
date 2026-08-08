import { describe, expect, it } from 'vitest';
import { createMessagingProvider } from './provider-factory';
import { defaultProviderForChannel } from './provider-specs';

/** GME-02a: the credential→adapter factory + per-channel default provider. */

describe('createMessagingProvider', () => {
  it('builds each known provider with the right id + channel from creds', () => {
    expect(
      createMessagingProvider('twilio', { accountSid: 'AC', authToken: 't', from: '+1' }),
    ).toMatchObject({ id: 'twilio', channel: 'SMS' });
    expect(
      createMessagingProvider('msg91', { authKey: 'k', sender: 's', flowId: 'f' }),
    ).toMatchObject({ id: 'msg91', channel: 'SMS' });
    expect(
      createMessagingProvider('gupshup', { userId: 'u', password: 'p', sender: 's' }),
    ).toMatchObject({ id: 'gupshup', channel: 'SMS' });
    expect(
      createMessagingProvider('whatsapp-cloud', { phoneNumberId: 'p', accessToken: 't' }),
    ).toMatchObject({ id: 'whatsapp-cloud', channel: 'WHATSAPP' });
    expect(createMessagingProvider('telegram', { botToken: 't' })).toMatchObject({
      id: 'telegram',
      channel: 'TELEGRAM',
    });
    expect(createMessagingProvider('messenger', { accessToken: 't' })).toMatchObject({
      id: 'messenger',
      channel: 'MESSENGER',
    });
    expect(createMessagingProvider('instagram', { accessToken: 't' })).toMatchObject({
      id: 'instagram',
      channel: 'INSTAGRAM',
    });
    expect(createMessagingProvider('rcs-gateway', { apiUrl: 'u', apiToken: 't' })).toMatchObject({
      id: 'rcs-gateway',
      channel: 'RCS',
    });
  });

  it('returns null for an unknown provider', () => {
    expect(createMessagingProvider('nope', {})).toBeNull();
  });
});

describe('defaultProviderForChannel', () => {
  it('maps a channel to its default provider id', () => {
    expect(defaultProviderForChannel('SMS')).toBe('twilio');
    expect(defaultProviderForChannel('WHATSAPP')).toBe('whatsapp-cloud');
    expect(defaultProviderForChannel('RCS')).toBe('rcs-gateway');
    expect(defaultProviderForChannel('EMAIL')).toBeUndefined(); // no provider spec yet
  });
});
