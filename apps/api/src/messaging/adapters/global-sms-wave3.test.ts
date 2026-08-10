import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../senders';
import { AwsSnsSmsSender } from './aws-sns';
import { BandwidthSmsSender } from './bandwidth';
import { ClickSendSmsSender } from './clicksend';

/** Global SMS wave-3 adapters (GME-09) exercised with a fake HTTP transport — no live credentials. */

const okJson = (json: unknown): HttpClient =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(json) }));
const okText = (body: string): HttpClient =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => body }));
type Call = [string, { headers: Record<string, string>; body: string }];

describe('BandwidthSmsSender', () => {
  it('posts JSON with Basic auth + to[] to the account messages URL and returns the id', async () => {
    const http = okJson({ id: 'bw-1' });
    const res = await new BandwidthSmsSender(
      'acct1',
      'app1',
      'user',
      'pass',
      '+19998887777',
      http,
    ).send({
      to: '+14155550100',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'bw-1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toBe('https://messaging.bandwidth.com/api/v2/users/acct1/messages');
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      applicationId: 'app1',
      to: ['+14155550100'],
      from: '+19998887777',
      text: 'hi',
    });
  });
});

describe('ClickSendSmsSender', () => {
  it('posts a messages[] batch with Basic auth and returns data.messages[0].message_id', async () => {
    const http = okJson({ data: { messages: [{ message_id: 'cs-1' }] } });
    const res = await new ClickSendSmsSender('user', 'KEY', 'VOCLIQ', http).send({
      to: '+14155550100',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'cs-1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toBe('https://rest.clicksend.com/v3/sms/send');
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from('user:KEY').toString('base64')}`);
    const payload = JSON.parse(init.body);
    expect(payload.messages[0]).toMatchObject({ to: '+14155550100', body: 'hi', from: 'VOCLIQ' });
  });
});

describe('AwsSnsSmsSender', () => {
  it('SigV4-signs a Publish POST (deterministic clock) and parses the MessageId from XML', async () => {
    const http = okText(
      '<PublishResponse><PublishResult><MessageId>sns-1</MessageId></PublishResult></PublishResponse>',
    );
    const clock = () => new Date('2026-08-10T05:51:17Z');
    const res = await new AwsSnsSmsSender('AKIATEST', 'SECRET', 'us-east-1', http, clock).send({
      to: '+14155550100',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'sns-1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toBe('https://sns.us-east-1.amazonaws.com/');
    expect(init.headers['x-amz-date']).toBe('20260810T055117Z');
    // Authorization: correct algorithm, credential scope, signed headers + a 64-hex SigV4 signature.
    expect(init.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATEST\/20260810\/us-east-1\/sns\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    const params = new URLSearchParams(init.body);
    expect(params.get('Action')).toBe('Publish');
    expect(params.get('PhoneNumber')).toBe('+14155550100');
    expect(params.get('Message')).toBe('hi');
    expect(params.get('Version')).toBe('2010-03-31');
  });

  it('is deterministic — the same inputs + clock produce the same signature', async () => {
    const clock = () => new Date('2026-08-10T05:51:17Z');
    const grab = async () => {
      const http = okText('<MessageId>x</MessageId>');
      await new AwsSnsSmsSender('AKIATEST', 'SECRET', 'us-east-1', http, clock).send({
        to: '+14155550100',
        body: 'hi',
      });
      const [, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
      return init.headers.authorization;
    };
    expect(await grab()).toBe(await grab());
  });
});
