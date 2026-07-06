import { createHmac } from 'node:crypto';
import {
  type CaptureEmailInput,
  type EmailTemplate,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  canEmail,
  captureEmailSchema,
  emailTemplateSchema,
  renderEmail,
  withUnsubscribeFooter,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Email as a campaign channel (Day 72). Marketing-grade sends via a gated Resend seam, an explicit
 * capture-email-mid-call → consent flow, and a hard consent gate: NO CONTACT IS EMAILED without a
 * lawful basis (imported/captured consent) and every send carries an unsubscribe link that an
 * opt-out honours forever (self-audit C). Cost is metered per send on a `Message` row (rule #4).
 * All reads/writes are RLS-scoped (self-audit B).
 */

export interface EmailSender {
  readonly name: string;
  send(msg: { to: string; subject: string; body: string }): Promise<{
    providerMessageId?: string;
    status: 'SENT' | 'FAILED';
    error?: string;
  }>;
}

/** Disabled sender (gated): records the intent but never dispatches until Resend keys are set. */
export class DisabledEmailSender implements EmailSender {
  readonly name = 'disabled';
  async send() {
    return {
      status: 'FAILED' as const,
      error: 'Marketing email not configured (set RESEND_API_KEY)',
    };
  }
}

/** Select the sender from env — a real Resend adapter swaps in when RESEND_API_KEY is set (gated). */
export function buildEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  if (env.RESEND_API_KEY && env.MARKETING_EMAIL_FROM) {
    // A ResendEmailSender lands here once the marketing domain (SPF/DKIM/DMARC) is verified.
    return new DisabledEmailSender();
  }
  return new DisabledEmailSender();
}

const EMAIL_COST_USD = 0.001; // per marketing email — metered on the Message row

export class EmailService {
  constructor(
    private readonly db: PrismaService,
    private readonly sender: EmailSender = new DisabledEmailSender(),
    private readonly baseUrl = process.env.APP_URL ?? 'https://app.vocaliq.dev',
    private readonly secret = process.env.APP_JWT_SECRET ?? 'dev-unsub-secret',
  ) {}

  /** Capture a contact's email + explicit consent mid-call (the lawful basis to email them). */
  async captureConsent(
    tenantId: string,
    contactId: string,
    input: unknown,
  ): Promise<{ email: string; consent: true }> {
    const parsed = captureEmailSchema.safeParse(input);
    if (!parsed.success)
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid email');
    const data: CaptureEmailInput = parsed.data;
    const contact = await this.db.withTenant(tenantId, (tx) =>
      tx.contact.findFirst({ where: { id: contactId }, select: { id: true } }),
    );
    if (!contact) throw new NotFoundError('Contact not found');
    await this.db.withTenant(tenantId, (tx) =>
      tx.contact.update({
        where: { id: contactId },
        data: {
          email: data.email.toLowerCase(),
          emailConsent: true,
          emailConsentSource: data.source,
          emailConsentAt: new Date(),
          unsubscribedAt: null, // fresh opt-in clears any prior unsubscribe
        },
      }),
    );
    return { email: data.email.toLowerCase(), consent: true };
  }

  /**
   * Send a marketing email to a contact — ONLY if the consent gate passes. Renders the template,
   * appends the unsubscribe footer, dispatches via the (gated) sender, records a `Message` with
   * cost, and returns the status. A non-consented/unsubscribed contact is refused (never emailed).
   */
  async send(
    tenantId: string,
    contactId: string,
    template: unknown,
    vars: Record<string, unknown> = {},
    campaignId?: string,
  ): Promise<{ status: string; skippedReason?: string }> {
    const tmpl = emailTemplateSchema.safeParse(template);
    if (!tmpl.success) throw new ValidationError('Invalid email template');
    const contact = await this.db.withTenant(tenantId, (tx) =>
      tx.contact.findFirst({
        where: { id: contactId },
        select: {
          id: true,
          email: true,
          name: true,
          fields: true,
          emailConsent: true,
          unsubscribedAt: true,
        },
      }),
    );
    if (!contact) throw new NotFoundError('Contact not found');

    const gate = canEmail({
      email: contact.email,
      emailConsent: contact.emailConsent,
      unsubscribedAt: contact.unsubscribedAt,
    });
    if (!gate.allowed) {
      // Hard refusal — the send never happens. Not an error (a sequence just skips).
      return { status: 'skipped', ...(gate.reason ? { skippedReason: gate.reason } : {}) };
    }

    const rendered = renderEmail(tmpl.data as EmailTemplate, {
      name: contact.name ?? '',
      ...((contact.fields as Record<string, unknown>) ?? {}),
      ...vars,
    });
    const body = withUnsubscribeFooter(rendered.body, this.unsubscribeUrl(contactId));
    const result = await this.sender.send({ to: contact.email!, subject: rendered.subject, body });

    await this.db.withTenant(tenantId, (tx) =>
      tx.message.create({
        data: {
          tenantId,
          channel: 'EMAIL',
          direction: 'OUTBOUND',
          status: result.status === 'SENT' ? 'SENT' : 'FAILED',
          toAddr: contact.email!,
          body: rendered.subject,
          contactId,
          ...(campaignId ? { campaignId } : {}),
          ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
          costUsd: result.status === 'SENT' ? EMAIL_COST_USD : 0,
          ...(result.error ? { error: result.error } : {}),
        },
      }),
    );
    return { status: result.status };
  }

  /** The unsubscribe URL for a contact (HMAC-signed token so it can't be forged). */
  unsubscribeUrl(contactId: string): string {
    return `${this.baseUrl}/u/${contactId}.${this.token(contactId)}`;
  }

  /** Honour an unsubscribe from a signed token — sets `unsubscribedAt` forever. */
  async unsubscribe(contactId: string, token: string): Promise<{ ok: true }> {
    if (this.token(contactId) !== token) throw new ForbiddenError('Invalid unsubscribe token');
    // Owner client: the unsubscribe link is followed unauthenticated, so no tenant session exists.
    const contact = await this.db.admin.contact.findUnique({
      where: { id: contactId },
      select: { id: true },
    });
    if (!contact) throw new NotFoundError('Contact not found');
    await this.db.admin.contact.update({
      where: { id: contactId },
      data: { unsubscribedAt: new Date(), emailConsent: false },
    });
    return { ok: true };
  }

  private token(contactId: string): string {
    return createHmac('sha256', this.secret)
      .update(`unsub:${contactId}`)
      .digest('hex')
      .slice(0, 32);
  }
}
