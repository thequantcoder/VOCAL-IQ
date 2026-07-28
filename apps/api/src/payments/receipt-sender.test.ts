import { describe, expect, it, vi } from 'vitest';
import type { EmailSender } from '../email/email.service';
import { DisabledReceiptSender, EmailReceiptSender, buildReceiptSender } from './payments.service';

/**
 * Receipt sender wired to the Resend email seam (no DB, no network). Proves an `email`-channel receipt
 * is emailed with a subject, an `sms`-channel receipt is skipped (no SMS sender), and the factory only
 * activates when Resend is configured.
 */

function fakeEmail(): EmailSender & { sent: Array<{ to: string; subject: string; body: string }> } {
  const sent: Array<{ to: string; subject: string; body: string }> = [];
  return {
    name: 'resend',
    sent,
    async send(msg) {
      sent.push(msg);
      return { status: 'SENT' as const, providerMessageId: 'em_1' };
    },
  };
}

describe('EmailReceiptSender', () => {
  it('emails an email-channel receipt through the email sender with a subject', async () => {
    const email = fakeEmail();
    await new EmailReceiptSender(email).send({
      channel: 'email',
      to: 'payer@acme.com',
      body: 'Payment of $10.00 received. Ref ch_1. Thank you!',
    });
    expect(email.sent).toEqual([
      {
        to: 'payer@acme.com',
        subject: 'Your VocalIQ payment receipt',
        body: 'Payment of $10.00 received. Ref ch_1. Thank you!',
      },
    ]);
  });

  it('skips an sms-channel receipt (no SMS sender wired) without touching email', async () => {
    const email = fakeEmail();
    const spy = vi.spyOn(email, 'send');
    await new EmailReceiptSender(email).send({ channel: 'sms', to: '+15551230001', body: 'x' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('buildReceiptSender', () => {
  it('emails receipts when Resend is configured', () => {
    const sender = buildReceiptSender({
      RESEND_API_KEY: 're_key',
      MARKETING_EMAIL_FROM: 'hi@vocaliq.app',
    } as NodeJS.ProcessEnv);
    expect(sender).toBeInstanceOf(EmailReceiptSender);
    expect(sender.enabled).toBe(true);
  });

  it('is disabled when Resend is not configured', () => {
    expect(buildReceiptSender({} as NodeJS.ProcessEnv)).toBeInstanceOf(DisabledReceiptSender);
    expect(buildReceiptSender({ RESEND_API_KEY: 're_key' } as NodeJS.ProcessEnv).enabled).toBe(
      false,
    );
  });
});
