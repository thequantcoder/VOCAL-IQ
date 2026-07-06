import { describe, expect, it } from 'vitest';
import {
  type EmailConsentState,
  type SequenceStep,
  canEmail,
  captureEmailSchema,
  nextSequenceStep,
  renderEmail,
  withUnsubscribeFooter,
} from './email-campaign.js';

describe('canEmail (consent gate — self-audit C)', () => {
  const ok: EmailConsentState = { email: 'a@b.com', emailConsent: true, unsubscribedAt: null };
  it('allows a consented, subscribed contact', () => {
    expect(canEmail(ok).allowed).toBe(true);
  });
  it('blocks with no address', () => {
    expect(canEmail({ ...ok, email: null }).allowed).toBe(false);
  });
  it('blocks without consent (never email scraped contacts)', () => {
    expect(canEmail({ ...ok, emailConsent: false }).reason).toContain('consent');
  });
  it('blocks after unsubscribe', () => {
    expect(canEmail({ ...ok, unsubscribedAt: new Date() }).reason).toContain('unsubscribed');
  });
});

describe('captureEmailSchema', () => {
  it('validates an email + defaults the source to captured_on_call', () => {
    expect(captureEmailSchema.parse({ email: 'x@y.com' }).source).toBe('captured_on_call');
    expect(() => captureEmailSchema.parse({ email: 'not-an-email' })).toThrow();
  });
});

describe('renderEmail + unsubscribe footer', () => {
  it('renders {{var}} placeholders in subject + body', () => {
    const r = renderEmail(
      { subject: 'Hi {{name}}', body: 'Your quote is {{amount}}', language: 'en' },
      { name: 'Ana', amount: '$99' },
    );
    expect(r.subject).toBe('Hi Ana');
    expect(r.body).toBe('Your quote is $99');
  });
  it('appends a mandatory unsubscribe footer', () => {
    const body = withUnsubscribeFooter('Hello', 'https://x/u/abc');
    expect(body).toContain('Unsubscribe: https://x/u/abc');
  });
});

describe('nextSequenceStep (blended call → sms → email)', () => {
  const steps: SequenceStep[] = [
    { channel: 'voice', delayHours: 0 },
    { channel: 'sms', afterOutcome: ['no_answer'], delayHours: 2 },
    { channel: 'email', afterOutcome: ['no_answer'], delayHours: 24 },
  ];
  it('runs the voice step first', () => {
    expect(
      nextSequenceStep(steps, { lastOutcome: null, firedIndexes: [], canEmail: true })?.step
        .channel,
    ).toBe('voice');
  });
  it('runs the SMS step after a no_answer', () => {
    expect(
      nextSequenceStep(steps, { lastOutcome: 'no_answer', firedIndexes: [0], canEmail: true })?.step
        .channel,
    ).toBe('sms');
  });
  it('SKIPS the email step when there is no email consent', () => {
    const next = nextSequenceStep(steps, {
      lastOutcome: 'no_answer',
      firedIndexes: [0, 1],
      canEmail: false,
    });
    expect(next).toBeNull(); // email is the only step left, and it's gated out
  });
  it('runs the email step when consent exists', () => {
    expect(
      nextSequenceStep(steps, { lastOutcome: 'no_answer', firedIndexes: [0, 1], canEmail: true })
        ?.step.channel,
    ).toBe('email');
  });
  it('does not run an outcome-gated step when the outcome does not match', () => {
    expect(
      nextSequenceStep(steps, { lastOutcome: 'completed', firedIndexes: [0], canEmail: true }),
    ).toBeNull();
  });
});
