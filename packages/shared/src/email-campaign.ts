import { z } from 'zod';
import { renderTemplate } from './lead.js';

/**
 * Email as a campaign channel + capture-email-mid-call with consent (Day 72) — pure consent gating,
 * template rendering, unsubscribe tokens, and blended-sequence logic shared across api/workers.
 * COMPLIANCE IS THE POINT: we only email a contact with a lawful basis (imported-with-consent or
 * captured-on-call) and never after they unsubscribe. Keeping the gate pure makes "no consent = no
 * email" deterministic + testable; the marketing send goes through a gated Resend seam.
 */

export type EmailConsentSource = 'imported' | 'captured_on_call' | 'web_form';

/** A contact's email-consent state (the lawful-basis record). */
export interface EmailConsentState {
  email: string | null;
  emailConsent: boolean;
  unsubscribedAt: Date | null;
}

/**
 * May we email this contact? Requires a deliverable address, an affirmative consent, and no
 * unsubscribe. This is the single gate every send passes through (self-audit C).
 */
export function canEmail(c: EmailConsentState): { allowed: boolean; reason?: string } {
  if (!c.email) return { allowed: false, reason: 'no email address' };
  // Unsubscribe is the definitive block — reported first, even if consent is also cleared.
  if (c.unsubscribedAt) return { allowed: false, reason: 'contact has unsubscribed' };
  if (!c.emailConsent) return { allowed: false, reason: 'no email consent (lawful basis)' };
  return { allowed: true };
}

export const captureEmailSchema = z.object({
  email: z.string().email(),
  source: z.enum(['imported', 'captured_on_call', 'web_form']).default('captured_on_call'),
  /** The consent language the caller agreed to (stored for the record). */
  consentText: z.string().max(300).optional(),
});
export type CaptureEmailInput = z.infer<typeof captureEmailSchema>;

export const emailTemplateSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  language: z.string().max(10).default('en'),
});
export type EmailTemplate = z.infer<typeof emailTemplateSchema>;

/** Render `{{var}}` placeholders in an email template's subject + body (reuses the lead renderer). */
export function renderEmail(
  template: EmailTemplate,
  vars: Record<string, unknown>,
): { subject: string; body: string } {
  return {
    subject: renderTemplate(template.subject, vars),
    body: renderTemplate(template.body, vars),
  };
}

/** Append the mandatory unsubscribe footer (CAN-SPAM/GDPR) to a rendered email body. */
export function withUnsubscribeFooter(body: string, unsubscribeUrl: string): string {
  return `${body}\n\n—\nYou received this because you opted in. Unsubscribe: ${unsubscribeUrl}`;
}

// ── Blended campaign sequence (call → SMS/WhatsApp → email per outcome) ──────────

export const CAMPAIGN_CHANNELS = ['voice', 'sms', 'whatsapp', 'email'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export interface SequenceStep {
  channel: CampaignChannel;
  /** Only run this step when the prior outcome matches (empty = always). */
  afterOutcome?: string[];
  /** Delay before this step (hours). */
  delayHours: number;
}

/**
 * Pick the next blended-sequence step to run for a lead given the last outcome + which steps have
 * already fired. An email step is only eligible if the contact can be emailed (consent gate), so a
 * sequence never tries to email a non-consented lead — it skips to the next eligible step.
 */
export function nextSequenceStep(
  steps: SequenceStep[],
  ctx: { lastOutcome: string | null; firedIndexes: number[]; canEmail: boolean },
): { index: number; step: SequenceStep } | null {
  for (let i = 0; i < steps.length; i++) {
    if (ctx.firedIndexes.includes(i)) continue;
    const step = steps[i]!;
    if (step.afterOutcome && step.afterOutcome.length > 0) {
      if (!ctx.lastOutcome || !step.afterOutcome.includes(ctx.lastOutcome)) continue;
    }
    if (step.channel === 'email' && !ctx.canEmail) continue; // never email without consent
    return { index: i, step };
  }
  return null;
}
