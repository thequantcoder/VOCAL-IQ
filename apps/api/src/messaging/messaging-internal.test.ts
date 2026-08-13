import { ValidationError } from '@vocaliq/shared';
import { describe, expect, it, vi } from 'vitest';
import { executeInternalSend } from './messaging-internal';
import type { MessagingService } from './messaging.service';

/** GME-19: the internal send primitive — delegates to MessagingService.send, maps a guard refusal to
 *  a permanent SKIPPED (no retry), and lets a transient error propagate (worker retries). No DB. */

const base = {
  tenantId: '00000000-0000-0000-0000-000000000003',
  channel: 'SMS' as const,
  to: '+1',
};

describe('executeInternalSend', () => {
  it('delegates a valid send and returns the status + id', async () => {
    const send = vi.fn(async () => ({ id: 'm1', status: 'SENT' }));
    const messaging = { send } as unknown as MessagingService;
    const out = await executeInternalSend(messaging, { ...base, body: 'hi', requireConsent: true });
    expect(out).toEqual({ status: 'SENT', id: 'm1' });
    // The consent flag was threaded through to the guarded send.
    expect(send).toHaveBeenCalledWith(
      base.tenantId,
      expect.objectContaining({ requireConsent: true }),
    );
  });

  it('maps a guard/validation refusal to a permanent SKIPPED (never retried)', async () => {
    const send = vi.fn(async () => {
      throw new ValidationError('Recipient has opted out of this channel');
    });
    const messaging = { send } as unknown as MessagingService;
    const out = await executeInternalSend(messaging, { ...base, body: 'hi' });
    expect(out.status).toBe('SKIPPED');
    expect(out.reason).toMatch(/opted out/i);
  });

  it('lets a transient (non-validation) error propagate so the worker can retry', async () => {
    const send = vi.fn(async () => {
      throw new Error('carrier 503');
    });
    const messaging = { send } as unknown as MessagingService;
    await expect(executeInternalSend(messaging, { ...base, body: 'hi' })).rejects.toThrow(/503/);
  });

  it('rejects a malformed payload', async () => {
    const messaging = { send: vi.fn() } as unknown as MessagingService;
    await expect(executeInternalSend(messaging, { channel: 'SMS' })).rejects.toThrow();
  });
});
