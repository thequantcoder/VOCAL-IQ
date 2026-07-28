import { describe, expect, it, vi } from 'vitest';
import { DisabledEmailSender, ResendEmailSender, buildEmailSender } from './email.service';

/**
 * Offline unit proof of the live Resend sender: a stubbed `fetch` records the request + returns a
 * canned response, so we assert the exact endpoint/auth/body, the SENT/FAILED mapping, and the
 * fail-soft behaviour (a delivery hiccup never throws) — no network, no key.
 */

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const notOk = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

const msg = { to: 'lead@acme.com', subject: 'Hi', body: '<p>Hello</p>' };

describe('ResendEmailSender', () => {
  it('POSTs to the Resend API with Bearer auth + html body and returns SENT + id', async () => {
    const fetchImpl = vi.fn(async () => ok({ id: 'em_123' })) as unknown as typeof fetch;
    const res = await new ResendEmailSender('re_key', 'VocalIQ <hi@vocaliq.app>', fetchImpl).send(
      msg,
    );

    expect(res).toEqual({ status: 'SENT', providerMessageId: 'em_123' });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(call[0]).toBe('https://api.resend.com/emails');
    const init = call[1] as { method: string; headers: Record<string, string>; body: string };
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body)).toEqual({
      from: 'VocalIQ <hi@vocaliq.app>',
      to: 'lead@acme.com',
      subject: 'Hi',
      html: '<p>Hello</p>',
    });
  });

  it('is fail-soft on a non-2xx (FAILED, never throws)', async () => {
    const res = await new ResendEmailSender('re_key', 'x@y.com', (async () =>
      notOk(422)) as unknown as typeof fetch).send(msg);
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('422');
  });

  it('is fail-soft on an unreachable API (FAILED, never throws)', async () => {
    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const res = await new ResendEmailSender('re_key', 'x@y.com', boom).send(msg);
    expect(res.status).toBe('FAILED');
    expect(res.error).toContain('ECONNREFUSED');
  });
});

describe('buildEmailSender', () => {
  it('returns the live Resend sender when RESEND_API_KEY + MARKETING_EMAIL_FROM are set', () => {
    const sender = buildEmailSender({
      RESEND_API_KEY: 're_key',
      MARKETING_EMAIL_FROM: 'hi@vocaliq.app',
    } as NodeJS.ProcessEnv);
    expect(sender).toBeInstanceOf(ResendEmailSender);
  });

  it('falls back to the disabled sender when either var is missing', () => {
    expect(buildEmailSender({ RESEND_API_KEY: 're_key' } as NodeJS.ProcessEnv)).toBeInstanceOf(
      DisabledEmailSender,
    );
    expect(buildEmailSender({} as NodeJS.ProcessEnv)).toBeInstanceOf(DisabledEmailSender);
  });
});
