import {
  type MessageChannel,
  type MessagingConsentChannel,
  type MessagingGateReason,
  type MessagingGateResult,
  isQuietTime,
  messagingQuietHoursSchema,
  phoneUtcOffsetMinutes,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import { MessagingConsentService } from './messaging-consent.service';

/**
 * Unified messaging send-gate (GME-15) — the SINGLE recipient-eligibility choke point every send path
 * routes through (API `send`/`sendRich`, and — later — the worker, automations, workflows, campaigns).
 * It composes, in order and short-circuiting on the first failure: opt-out → DNC/suppression → (channel
 * consent, when required) → (quiet-hours, when respected). Rate-limit (abuse/velocity) + India DLT
 * (content) are orthogonal and stay in the send path; this guard answers "may we message THIS recipient
 * on THIS channel right now?" and returns a clear reason on refusal — never a silent drop.
 */

export interface MessagingGuardContext {
  channel: MessageChannel;
  phone: string;
  contactId?: string;
  /** Require channel consent (the consent-driven follow-up path sets this; transactional sends don't). */
  requireConsent?: boolean;
  /** Enforce quiet-hours (TCPA 8am–9pm local by default; the follow-up path sets this). */
  respectQuietHours?: boolean;
  /** Injected "now" for deterministic quiet-hours tests. */
  now?: Date;
}

const CONSENT_CHANNELS: readonly MessagingConsentChannel[] = ['SMS', 'WHATSAPP', 'RCS'];
const DEFAULT_QUIET_WINDOW = { startHour: 8, endHour: 21 };

export class MessagingGuard {
  constructor(
    private readonly db: PrismaService,
    private readonly consent: MessagingConsentService = new MessagingConsentService(db),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(tenantId: string, ctx: MessagingGuardContext): Promise<MessagingGateResult> {
    // opt-out (per channel) → DNC/suppression → Contact.dnc — one tenant-scoped (RLS) read pass.
    const blocked = await this.db.withTenant(
      tenantId,
      async (tx): Promise<MessagingGateReason | null> => {
        const optedOut = await tx.messagingOptOut.findFirst({
          where: { channel: ctx.channel, phone: ctx.phone },
          select: { id: true },
        });
        if (optedOut) return 'opted_out';
        const suppressed = await tx.suppression.findFirst({
          where: { phone: ctx.phone },
          select: { id: true },
        });
        if (suppressed) return 'suppressed';
        const contact = await tx.contact.findFirst({
          where: ctx.contactId ? { id: ctx.contactId } : { phone: ctx.phone },
          select: { dnc: true },
        });
        if (contact?.dnc) return 'dnc';
        return null;
      },
    );
    if (blocked) return { allowed: false, reason: blocked };

    // Channel consent — enforced only when the caller requires it (the follow-up automation does).
    if (ctx.requireConsent && CONSENT_CHANNELS.includes(ctx.channel as MessagingConsentChannel)) {
      const ok = await this.consent.hasConsent(
        tenantId,
        ctx.channel as MessagingConsentChannel,
        ctx.phone,
      );
      if (!ok) return { allowed: false, reason: 'no_consent' };
    }

    // Quiet-hours — when respected, enforce the tenant window (else the TCPA 8–21 default) at the
    // recipient's approximate local time.
    if (ctx.respectQuietHours) {
      const qh = await this.quietHoursFor(tenantId);
      const window = qh.enabled ? qh : DEFAULT_QUIET_WINDOW;
      const now = ctx.now ?? this.now();
      if (isQuietTime(now, phoneUtcOffsetMinutes(ctx.phone), window)) {
        return { allowed: false, reason: 'quiet_hours' };
      }
    }

    return { allowed: true };
  }

  private async quietHoursFor(tenantId: string) {
    const t = await this.db.withTenant(tenantId, (tx) =>
      tx.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } }),
    );
    const settings = (t?.settings ?? {}) as { messagingQuietHours?: unknown };
    return messagingQuietHoursSchema.parse(settings.messagingQuietHours ?? {});
  }
}

/** A user-facing message for a gate refusal (never leaks internals). */
export function gateReasonMessage(reason: MessagingGateReason): string {
  switch (reason) {
    case 'opted_out':
      return 'Recipient has opted out of this channel';
    case 'suppressed':
      return 'Recipient is on the suppression/DNC list';
    case 'dnc':
      return 'Recipient is marked do-not-contact';
    case 'no_consent':
      return 'No messaging consent on record for this recipient';
    case 'quiet_hours':
      return 'Blocked by quiet hours (recipient local time)';
  }
}
