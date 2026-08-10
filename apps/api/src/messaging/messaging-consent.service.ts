import {
  type MessagingConsentChannel,
  type SetMessagingConsentInput,
  detectConsentIntent,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/**
 * Messaging consent (GME-14) — records + revokes a contact's lawful basis to be messaged on
 * SMS/WhatsApp/RCS, the input to the unified send-gate (GME-15). Each change writes BOTH the
 * denormalised `Contact` flags (fast gate reads) AND an append-only `ConsentRecord` per channel
 * (audit: basis + region + timestamp — grants and revokes alike). Tenant-scoped via `withTenant` (RLS).
 * `captureFromTranscript` turns an in-call "yes, text me" into consent using the shared heuristic (or
 * an LLM-extracted intent passed in), which is how the voice/post-call layer captures consent (GME-16).
 */

const CHANNEL_FIELD: Record<
  MessagingConsentChannel,
  'smsConsent' | 'whatsappConsent' | 'rcsConsent'
> = {
  SMS: 'smsConsent',
  WHATSAPP: 'whatsappConsent',
  RCS: 'rcsConsent',
};

const SELECT_CONSENT = {
  smsConsent: true,
  whatsappConsent: true,
  rcsConsent: true,
  messagingConsentBasis: true,
  messagingConsentAt: true,
} as const;

export interface ConsentState {
  phone: string;
  sms: boolean;
  whatsapp: boolean;
  rcs: boolean;
  basis: string | null;
  at: Date | null;
}

type ConsentRow = {
  smsConsent: boolean;
  whatsappConsent: boolean;
  rcsConsent: boolean;
  messagingConsentBasis: string | null;
  messagingConsentAt: Date | null;
} | null;

export class MessagingConsentService {
  constructor(private readonly db: PrismaService) {}

  /** Grant or revoke consent for one+ channels — updates the Contact flags + appends ConsentRecords. */
  async setConsent(tenantId: string, input: SetMessagingConsentInput): Promise<ConsentState> {
    const data: {
      smsConsent?: boolean;
      whatsappConsent?: boolean;
      rcsConsent?: boolean;
      messagingConsentBasis: string;
      messagingConsentAt: Date;
    } = { messagingConsentBasis: input.basis, messagingConsentAt: new Date() };
    for (const c of input.channels) data[CHANNEL_FIELD[c]] = input.granted;

    return this.db.withTenant(tenantId, async (tx) => {
      // Consent is keyed by phone; update the matching contact if one exists (a lead may pre-date it).
      const contact = await tx.contact.findFirst({
        where: { phone: input.phone },
        select: { id: true },
      });
      if (contact) {
        await tx.contact.update({ where: { id: contact.id }, data });
      }
      // Append one audit record per channel — both grants and revokes are recorded (append-only).
      for (const channel of input.channels) {
        await tx.consentRecord.create({
          data: {
            tenantId,
            contactPhone: input.phone,
            region: input.region,
            channel,
            granted: input.granted,
            basis: input.source ? `${input.basis}:${input.source}` : input.basis,
          },
        });
      }
      const row = await tx.contact.findFirst({
        where: { phone: input.phone },
        select: SELECT_CONSENT,
      });
      return toState(input.phone, row);
    });
  }

  async getConsent(tenantId: string, phone: string): Promise<ConsentState> {
    return this.db.withTenant(tenantId, async (tx) => {
      const row = await tx.contact.findFirst({ where: { phone }, select: SELECT_CONSENT });
      return toState(phone, row);
    });
  }

  /** The gate helper (GME-15) — does the contact consent to this channel? */
  async hasConsent(
    tenantId: string,
    channel: MessagingConsentChannel,
    phone: string,
  ): Promise<boolean> {
    const s = await this.getConsent(tenantId, phone);
    if (channel === 'SMS') return s.sms;
    if (channel === 'WHATSAPP') return s.whatsapp;
    return s.rcs;
  }

  /**
   * Capture consent from a call transcript (or a pre-extracted intent). Runs the shared heuristic when
   * no `intent` is supplied; a no-decision transcript records nothing and returns null.
   */
  async captureFromTranscript(
    tenantId: string,
    phone: string,
    transcript: string,
    opts: {
      region?: string;
      source?: string;
      intent?: { granted: boolean; channels: MessagingConsentChannel[] };
    } = {},
  ): Promise<ConsentState | null> {
    const intent = opts.intent ?? detectConsentIntent(transcript);
    if (!intent) return null;
    return this.setConsent(tenantId, {
      phone,
      channels: intent.channels,
      granted: intent.granted,
      basis: 'in_call_consent',
      region: opts.region ?? 'US',
      ...(opts.source ? { source: opts.source } : {}),
    });
  }
}

function toState(phone: string, c: ConsentRow): ConsentState {
  return {
    phone,
    sms: c?.smsConsent ?? false,
    whatsapp: c?.whatsappConsent ?? false,
    rcs: c?.rcsConsent ?? false,
    basis: c?.messagingConsentBasis ?? null,
    at: c?.messagingConsentAt ?? null,
  };
}
