import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../senders';
import { Fast2SmsSender } from './fast2sms';
import { KaleyraSmsSender } from './kaleyra';
import { RouteMobileSmsSender } from './route-mobile';
import { TextlocalSmsSender } from './textlocal';

/** India SMS wave-2 adapters (GME-10) — fake HTTP transport, no live creds; DLT stamping verified. */

const okJson = (json: unknown): HttpClient =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(json) }));
const okText = (body: string): HttpClient =>
  vi.fn(async () => ({ ok: true, status: 200, text: async () => body }));
type Call = [string, { headers: Record<string, string>; body: string }];

describe('KaleyraSmsSender', () => {
  it('posts JSON to the default India domain with api-key auth and returns the id', async () => {
    const http = okJson({ id: 'k-1' });
    // Empty apiDomain → the adapter falls back to api.in.kaleyra.io.
    const res = await new KaleyraSmsSender('KEY', 'SID', 'VOCLIQ', '', http).send({
      to: '+919812345678',
      body: 'hi',
      dltTemplateId: 'TID1',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'k-1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toBe('https://api.in.kaleyra.io/v1/SID/messages');
    expect(init.headers['api-key']).toBe('KEY');
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({
      to: '+919812345678',
      sender: 'VOCLIQ',
      type: 'TXN',
      body: 'hi',
    });
    expect(payload.template_id).toBe('TID1'); // DLT template stamped
  });
});

describe('Fast2SmsSender', () => {
  it('posts the dlt_manual route with per-send DLT ids and returns request_id', async () => {
    const http = okJson({ return: true, request_id: 'f-1' });
    const res = await new Fast2SmsSender('APIKEY', 'FALLBK', 'ENT_FALLBACK', http).send({
      to: '+919812345678',
      body: 'hi',
      dltSender: 'SND',
      dltEntityId: 'E1',
      dltTemplateId: 'T1',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'f-1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toBe('https://www.fast2sms.com/dev/bulkV2');
    expect(init.headers.authorization).toBe('APIKEY');
    const p = new URLSearchParams(init.body);
    expect(p.get('route')).toBe('dlt_manual');
    expect(p.get('numbers')).toBe('9812345678'); // +91 stripped
    expect(p.get('sender_id')).toBe('SND'); // per-send DLT sender wins over the creds fallback
    expect(p.get('entity_id')).toBe('E1');
    expect(p.get('template_id')).toBe('T1');
    expect(p.get('message')).toBe('hi');
  });

  it('falls back to the creds entity id + sender when the send carries none', async () => {
    const http = okJson({ return: true, request_id: 'f-2' });
    await new Fast2SmsSender('APIKEY', 'FALLBK', 'ENT_FALLBACK', http).send({
      to: '+919812345678',
      body: 'hi',
    });
    const [, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    const p = new URLSearchParams(init.body);
    expect(p.get('sender_id')).toBe('FALLBK');
    expect(p.get('entity_id')).toBe('ENT_FALLBACK');
  });
});

describe('TextlocalSmsSender', () => {
  it('posts form params with the country code (no +) and returns messages[0].id', async () => {
    const http = okJson({ status: 'success', messages: [{ id: 't-1' }] });
    const res = await new TextlocalSmsSender('APIKEY', 'VOCLIQ', http).send({
      to: '+919812345678',
      body: 'hi',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 't-1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toBe('https://api.textlocal.in/send/');
    const p = new URLSearchParams(init.body);
    expect(p.get('apikey')).toBe('APIKEY');
    expect(p.get('numbers')).toBe('919812345678');
    expect(p.get('sender')).toBe('VOCLIQ');
    expect(p.get('message')).toBe('hi');
  });

  it('surfaces a Textlocal failure status as FAILED', async () => {
    const http = okJson({ status: 'failure', errors: [{ message: 'Invalid sender' }] });
    const res = await new TextlocalSmsSender('APIKEY', 'VOCLIQ', http).send({
      to: '+919812345678',
      body: 'hi',
    });
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('Invalid sender');
  });
});

describe('RouteMobileSmsSender', () => {
  it('posts to the default host, stamps DLT ids, and parses the pipe reply (1701 = sent)', async () => {
    const http = okText('1701|919812345678|rm-1');
    const res = await new RouteMobileSmsSender('user', 'pass', 'VOCLIQ', '', http).send({
      to: '+919812345678',
      body: 'hi',
      dltEntityId: 'E1',
      dltTemplateId: 'T1',
    });
    expect(res).toEqual({ status: 'SENT', providerMessageId: 'rm-1' });
    const [url, init] = (http as ReturnType<typeof vi.fn>).mock.calls[0] as Call;
    expect(url).toBe('https://api.rmlconnect.net/bulksms/bulksms');
    const p = new URLSearchParams(init.body);
    expect(p.get('destination')).toBe('919812345678');
    expect(p.get('source')).toBe('VOCLIQ');
    expect(p.get('entityid')).toBe('E1');
    expect(p.get('tempid')).toBe('T1');
    expect(p.get('message')).toBe('hi');
  });

  it('treats a non-1701 reply code as FAILED', async () => {
    const http = okText('1710|919812345678|');
    const res = await new RouteMobileSmsSender('user', 'pass', 'VOCLIQ', '', http).send({
      to: '+919812345678',
      body: 'hi',
    });
    expect(res.status).toBe('FAILED');
  });
});
