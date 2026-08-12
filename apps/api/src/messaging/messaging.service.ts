import {
  Capability,
  type ChannelMix,
  type InboundIntent,
  type MessageChannel,
  type MessageStatus,
  type MessageTemplateInput,
  NotFoundError,
  Provider,
  RateLimitError,
  RcsCapabilityCache,
  type RcsProvider,
  type RichMessage,
  ValidationError,
  blendedNextStep,
  cascadePolicySchema,
  classifyInbound,
  extractTemplateVars,
  messageCostUsd,
  parseRichMessage,
  planCascade,
  renderMessageTemplate,
  richMessageToText,
  shouldAdvanceStatus,
  smsSegments,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import { RateLimiter } from '../widget/rate-limiter';
import type { DltResolver } from './dlt.service';
import { MessagingGuard, gateReasonMessage } from './messaging-guard';
import type { ResolvedMessagingCreds } from './messaging-key-vault';
import { type ProviderFactory, createMessagingProvider } from './provider-factory';
import { messagingProviderEnum } from './provider-specs';
import { buildRbmProvider } from './rbm';
import { type MessageRouter, SmartRouter, countryFromPhone } from './routing';
import { type HttpClient, fetchHttp } from './senders';

/** Per-tenant safety cap on outbound sends per minute — a RUNAWAY/abuse guard (a send loop or a
 *  compromised key), deliberately generous so legitimate bulk never hits it; plan-driven business
 *  quotas layer on top in GME-04. */
const DEFAULT_SEND_RATE_PER_MIN = 1000;

/**
 * The credential resolver the send path depends on (GME-02a) — BYOK-first (`MessagingKeyVault`).
 * An interface so tests can inject a fake without a DB round-trip.
 */
export interface MessagingCredsResolver {
  resolve(tenantId: string, providerId: string): Promise<ResolvedMessagingCreds | null>;
}

/**
 * Messaging (Day 44): tenant-scoped WhatsApp/SMS template CRUD, outbound send (opt-out
 * checked → template rendered → dispatched via an injected channel adapter → cost metered →
 * persisted), and inbound/status webhook handling (opt-out/opt-in + delivery updates). All
 * reads/writes run under `withTenant` (RLS). Credentials are resolved per send (BYOK → platform →
 * env, GME-02a) and gated: with no provider configured for the tenant, a send is recorded as QUEUED
 * but not dispatched, so the app runs without keys.
 */

export interface MessageTemplateRow {
  id: string;
  channel: MessageChannel;
  name: string;
  language: string;
  category: string;
  body: string;
  variables: string[];
  approvalStatus: string;
  active: boolean;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  channel: MessageChannel;
  direction: string;
  status: MessageStatus;
  toAddr: string;
  body: string;
  costUsd: number;
  error: string | null;
  createdAt: Date;
}

export interface SendInput {
  channel: MessageChannel;
  to: string;
  templateId?: string;
  body?: string;
  variables?: Record<string, string>;
  contactId?: string;
  callId?: string;
  campaignId?: string;
  // Rich RCS (GME-12b): when a rich send cascades to this channel, stamp its payload + provenance.
  richPayload?: unknown;
  fallbackFrom?: string;
  fallbackTo?: string;
  // Consent-driven follow-up (GME-16): opt into the consent + quiet-hours gates for this send.
  requireConsent?: boolean;
  respectQuietHours?: boolean;
}

export interface SendRichInput {
  to: string;
  /** A RichMessage (validated with `parseRichMessage`); may be a raw object from the API. */
  richMessage: unknown;
  /** Cascade policy (prefer RCS + ordered fallback channels); defaults to RCS→SMS. */
  policy?: unknown;
  contactId?: string;
  callId?: string;
  campaignId?: string;
}

export class MessagingService {
  private readonly http: HttpClient;
  private readonly factory: ProviderFactory;
  private readonly rateLimiter: RateLimiter;
  private readonly router: MessageRouter;
  private readonly dlt: DltResolver | undefined;
  // Rich RCS (GME-12): the RcsProvider (RBM, gated on GOOGLE_RBM_*) + a per-msisdn capability cache.
  private readonly rcsProvider: RcsProvider | undefined;
  private readonly rcsCapCache: RcsCapabilityCache;
  // Unified send-gate (GME-15): the single recipient-eligibility choke point.
  private readonly guard: MessagingGuard;
  constructor(
    private readonly db: PrismaService,
    private readonly credsResolver: MessagingCredsResolver,
    opts?: {
      http?: HttpClient;
      providerFactory?: ProviderFactory;
      rateLimiter?: RateLimiter;
      router?: MessageRouter;
      dlt?: DltResolver;
      rcsProvider?: RcsProvider;
      rcsCapCache?: RcsCapabilityCache;
      guard?: MessagingGuard;
    },
  ) {
    this.http = opts?.http ?? fetchHttp;
    this.factory = opts?.providerFactory ?? createMessagingProvider;
    this.rateLimiter = opts?.rateLimiter ?? new RateLimiter(DEFAULT_SEND_RATE_PER_MIN, 60_000);
    this.router = opts?.router ?? new SmartRouter();
    this.dlt = opts?.dlt;
    this.rcsProvider = opts?.rcsProvider ?? buildRbmProvider(process.env);
    this.rcsCapCache = opts?.rcsCapCache ?? new RcsCapabilityCache();
    this.guard = opts?.guard ?? new MessagingGuard(db);
  }

  // ── Template CRUD ─────────────────────────────────────────────────────────────

  async createTemplate(tenantId: string, input: MessageTemplateInput): Promise<MessageTemplateRow> {
    const variables = extractTemplateVars(input.body);
    // WhatsApp templates require Meta approval before use; SMS is free-form.
    const approvalStatus = input.channel === 'WHATSAPP' ? 'PENDING' : 'APPROVED';
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.messageTemplate.create({
        data: {
          tenantId,
          channel: input.channel,
          name: input.name,
          language: input.language,
          category: input.category,
          body: input.body,
          variables,
          approvalStatus,
          active: input.active,
        },
        select: SELECT_TEMPLATE,
      }),
    );
    return toTemplateRow(row);
  }

  async listTemplates(tenantId: string): Promise<MessageTemplateRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.messageTemplate.findMany({ orderBy: { createdAt: 'desc' }, select: SELECT_TEMPLATE }),
    );
    return rows.map(toTemplateRow);
  }

  async deleteTemplate(tenantId: string, id: string): Promise<{ deleted: true }> {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.messageTemplate.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('Template not found');
    await this.db.withTenant(tenantId, (tx) => tx.messageTemplate.delete({ where: { id } }));
    return { deleted: true };
  }

  // ── Send ──────────────────────────────────────────────────────────────────────

  /**
   * Send one outbound message. Resolves the body (template + variables OR free-form),
   * REFUSES if the recipient opted out (compliance — self-audit C) or a template variable is
   * missing, dispatches via the channel adapter (if configured), meters cost, and persists.
   */
  async send(tenantId: string, input: SendInput): Promise<MessageRow> {
    // Per-tenant abuse/runaway guard (GME-02c) — cheap in-memory check first, before any DB work.
    if (!this.rateLimiter.hit(tenantId)) {
      throw new RateLimitError('Messaging send rate limit reached; slow down');
    }
    // GME-15: the unified recipient-eligibility gate (opt-out + DNC/suppression). Transactional sends
    // don't require consent or respect quiet-hours — the consent-driven follow-up path opts into those.
    const gate = await this.guard.check(tenantId, {
      channel: input.channel,
      phone: input.to,
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.requireConsent ? { requireConsent: true } : {}),
      ...(input.respectQuietHours ? { respectQuietHours: true } : {}),
    });
    if (!gate.allowed && gate.reason) {
      throw new ValidationError(gateReasonMessage(gate.reason));
    }

    let body = input.body ?? '';
    let templateId: string | undefined;
    let templateName: string | undefined;
    let language: string | undefined;
    if (input.templateId) {
      const tid = input.templateId; // narrow before the closure (exactOptionalPropertyTypes)
      const template = await this.db.withTenant(tenantId, (tx) =>
        tx.messageTemplate.findFirst({
          where: { id: tid },
          select: { id: true, body: true, name: true, language: true, active: true },
        }),
      );
      if (!template) throw new NotFoundError('Template not found');
      if (!template.active) throw new ValidationError('Template is not active');
      const rendered = renderMessageTemplate(template.body, input.variables ?? {});
      if (rendered.missing.length > 0) {
        throw new ValidationError(`Missing template variables: ${rendered.missing.join(', ')}`);
      }
      body = rendered.text;
      templateId = template.id;
      templateName = template.name;
      language = template.language;
    }
    if (!body.trim()) throw new ValidationError('Message body is required');

    const costUsd = messageCostUsd(input.channel, body);
    // GME-03: the smart router returns an ordered provider chain (cheapest healthy first). Try each
    // provider with its BYOK-resolved creds (tenant vault → platform row → env); fall over to the
    // next on a hard failure, recording each outcome so unhealthy providers get ejected from routing.
    // India DLT (GME-06): a +91 SMS must match a DLT-registered template, else it's blocked. When it
    // matches, the resolved template/sender/entity ids are stamped onto the carrier request.
    const country = countryFromPhone(input.to);
    let dltTemplateId: string | undefined;
    let dltSender: string | undefined;
    let dltEntityId: string | undefined;
    if (this.dlt && input.channel === 'SMS' && country === 'IN') {
      const dlt = await this.dlt.resolveForBody(tenantId, body);
      if (!dlt) {
        throw new ValidationError(
          'India SMS requires a matching registered DLT template (register it under Messaging → DLT)',
        );
      }
      dltTemplateId = dlt.dltTemplateId;
      dltSender = dlt.senderId;
      dltEntityId = dlt.entityId;
    }

    const chain = this.router.selectChain(input.channel, country);
    let status: MessageStatus = 'QUEUED';
    let providerMessageId: string | undefined;
    let usedProviderId: string | undefined;
    let usedByok = false;
    let error: string | undefined;
    let attempted = false;
    for (const pid of chain) {
      const resolved = await this.credsResolver.resolve(tenantId, pid);
      if (!resolved) continue; // no creds for this provider (for this tenant) — try the next
      const adapter = this.factory(resolved.providerId, resolved.creds, this.http);
      if (!adapter) continue;
      attempted = true;
      const result = await adapter.send({
        to: input.to,
        body,
        ...(templateName ? { templateName } : {}),
        ...(language ? { language } : {}),
        ...(dltTemplateId ? { dltTemplateId } : {}),
        ...(dltSender ? { dltSender } : {}),
        ...(dltEntityId ? { dltEntityId } : {}),
      });
      this.router.record(pid, result.status === 'SENT');
      usedProviderId = pid;
      if (result.status === 'SENT') {
        status = 'SENT';
        providerMessageId = result.providerMessageId;
        usedByok = resolved.mode === 'byok';
        error = undefined;
        break;
      }
      status = 'FAILED';
      error = result.error; // hard failure — fall over to the next provider in the chain
    }
    if (!attempted) error = 'No messaging provider configured for this channel';

    // GME-04: meter a real send into the unified cost pipeline (UsageRecord) — mirrors the voice
    // meterTerminated pattern; wallet debit + reseller margin roll up from these records (BYOK is
    // recorded but excluded from billable). Only when the message actually SENT via a mapped provider.
    const billingProvider =
      status === 'SENT' && usedProviderId ? messagingProviderEnum(usedProviderId) : undefined;

    const row = await this.db.withTenant(tenantId, async (tx) => {
      const msg = await tx.message.create({
        data: {
          tenantId,
          channel: input.channel,
          direction: 'OUTBOUND',
          status,
          toAddr: input.to,
          body,
          costUsd,
          ...(templateId ? { templateId } : {}),
          ...(input.contactId ? { contactId: input.contactId } : {}),
          ...(input.callId ? { callId: input.callId } : {}),
          ...(input.campaignId ? { campaignId: input.campaignId } : {}),
          ...(providerMessageId ? { providerMessageId } : {}),
          ...(usedProviderId ? { providerId: usedProviderId } : {}),
          ...(error ? { error } : {}),
          ...(input.richPayload ? { richPayload: input.richPayload as object } : {}),
          ...(input.fallbackFrom ? { fallbackFrom: input.fallbackFrom } : {}),
          ...(input.fallbackTo ? { fallbackTo: input.fallbackTo } : {}),
        },
        select: SELECT_MESSAGE,
      });
      if (billingProvider) {
        // SMS bills per segment; the rest per message.
        const units = input.channel === 'SMS' ? smsSegments(body) : 1;
        await tx.usageRecord.create({
          data: {
            tenantId,
            provider: billingProvider,
            capability: Capability.MESSAGING,
            units,
            costUsd,
            byok: usedByok,
            ...(input.callId ? { callId: input.callId } : {}),
          },
        });
      }
      return msg;
    });
    return toMessageRow(row);
  }

  // ── Rich RCS send with cascade (GME-12) ────────────────────────────────────────

  /**
   * Send a rich (RCS) message with graceful fallback (GME-11 cascade + GME-12 RBM provider). Checks
   * whether the recipient is RCS-reachable (cached), plans the channel chain (RCS→WhatsApp/SMS per
   * policy), and delivers over RCS when possible — otherwise (or when RCS fails) it falls back to the
   * next channel with the plain-text projection of the rich message, recording the fallback provenance
   * on the Message. The fallback leg reuses `send()` so opt-out/DLT/metering all still apply; the RCS
   * leg is metered here (Provider.RCS). Gated: with no RCS provider configured, it always falls back.
   */
  async sendRich(tenantId: string, input: SendRichInput): Promise<MessageRow> {
    if (!this.rateLimiter.hit(tenantId)) {
      throw new RateLimitError('Messaging send rate limit reached; slow down');
    }
    const rich = parseRichMessage(input.richMessage);
    const text = richMessageToText(rich);
    const policy = cascadePolicySchema.parse(input.policy ?? {});

    // RCS capability (cached per msisdn), gated on a configured RCS provider.
    let capable = false;
    if (this.rcsProvider) {
      const cached = this.rcsCapCache.get(input.to);
      capable = cached ?? (await this.rcsProvider.capabilityCheck(input.to));
      if (cached === undefined) this.rcsCapCache.set(input.to, capable);
    }

    const chain = planCascade(capable, policy);
    const relay = {
      ...(input.contactId ? { contactId: input.contactId } : {}),
      ...(input.callId ? { callId: input.callId } : {}),
      ...(input.campaignId ? { campaignId: input.campaignId } : {}),
    };

    // RCS leads the chain only when the recipient is capable + the policy prefers it — AND the unified
    // gate (GME-15) allows RCS to this recipient. A guard-blocked RCS (e.g. RCS opt-out) falls through
    // to the fallback channel, whose send() re-checks the gates (so DNC/suppression still blocks all).
    if (chain[0] === 'RCS' && this.rcsProvider) {
      const gate = await this.guard.check(tenantId, {
        channel: 'RCS',
        phone: input.to,
        ...(input.contactId ? { contactId: input.contactId } : {}),
      });
      if (gate.allowed) {
        const result = await this.rcsProvider.sendRich(input.to, rich);
        if (result.ok) {
          return this.persistRcs(tenantId, {
            to: input.to,
            text,
            rich,
            providerId: this.rcsProvider.id,
            providerMessageId: result.providerMessageId,
            ...relay,
          });
        }
        // RCS attempted but failed → fall back to the text variant, recording provenance.
        const fallbackChannel = chain.find((c) => c !== 'RCS') ?? 'SMS';
        return this.send(tenantId, {
          channel: fallbackChannel,
          to: input.to,
          body: text,
          richPayload: rich,
          fallbackFrom: 'RCS',
          fallbackTo: fallbackChannel,
          ...relay,
        });
      }
    }

    // Not RCS-capable (or preferRcs off / no provider / guard blocked RCS) → the first non-RCS channel.
    const fallbackChannel = chain.find((c) => c !== 'RCS') ?? 'SMS';
    return this.send(tenantId, {
      channel: fallbackChannel,
      to: input.to,
      body: text,
      richPayload: rich,
      ...relay,
    });
  }

  /** Persist + meter a rich message delivered over RCS (mirrors the SMS send's persist/meter block). */
  private async persistRcs(
    tenantId: string,
    m: {
      to: string;
      text: string;
      rich: RichMessage;
      providerId: string;
      providerMessageId?: string | undefined;
      contactId?: string;
      callId?: string;
      campaignId?: string;
    },
  ): Promise<MessageRow> {
    const costUsd = messageCostUsd('RCS', m.text);
    const row = await this.db.withTenant(tenantId, async (tx) => {
      const msg = await tx.message.create({
        data: {
          tenantId,
          channel: 'RCS',
          direction: 'OUTBOUND',
          status: 'SENT',
          toAddr: m.to,
          body: m.text,
          costUsd,
          richPayload: m.rich as object,
          providerId: m.providerId,
          ...(m.providerMessageId ? { providerMessageId: m.providerMessageId } : {}),
          ...(m.contactId ? { contactId: m.contactId } : {}),
          ...(m.callId ? { callId: m.callId } : {}),
          ...(m.campaignId ? { campaignId: m.campaignId } : {}),
        },
        select: SELECT_MESSAGE,
      });
      await tx.usageRecord.create({
        data: {
          tenantId,
          provider: Provider.RCS,
          capability: Capability.MESSAGING,
          units: 1,
          costUsd,
          byok: false,
          ...(m.callId ? { callId: m.callId } : {}),
        },
      });
      return msg;
    });
    return toMessageRow(row);
  }

  // ── Inbound / status webhooks ──────────────────────────────────────────────────

  /**
   * Record an inbound message. If the body is an opt-out/opt-in keyword, update the
   * suppression list accordingly (compliance). Returns the classified intent.
   */
  async recordInbound(
    tenantId: string,
    input: { channel: MessageChannel; from: string; body: string; providerMessageId?: string },
  ): Promise<{ intent: InboundIntent }> {
    const intent = classifyInbound(input.body);
    // Idempotency (GME-02b): providers replay inbound webhooks. If we've already recorded this exact
    // inbound message (same provider id), don't re-insert it or re-apply its opt-out/opt-in effect.
    if (input.providerMessageId) {
      const pmid = input.providerMessageId; // narrow before the closure (exactOptionalPropertyTypes)
      const seen = await this.db.withTenant(tenantId, (tx) =>
        tx.message.findFirst({
          where: { channel: input.channel, direction: 'INBOUND', providerMessageId: pmid },
          select: { id: true },
        }),
      );
      if (seen) return { intent };
    }
    await this.db.withTenant(tenantId, (tx) =>
      tx.message.create({
        data: {
          tenantId,
          channel: input.channel,
          direction: 'INBOUND',
          status: 'RECEIVED',
          toAddr: 'inbound',
          fromAddr: input.from,
          body: input.body,
          ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
        },
      }),
    );
    if (intent === 'opt_out') await this.optOut(tenantId, input.channel, input.from);
    if (intent === 'opt_in') await this.optIn(tenantId, input.channel, input.from);
    return { intent };
  }

  /**
   * Update an outbound message's delivery status by provider id (status callback). DLR callbacks
   * arrive out of order + get replayed, so we only ADVANCE the status (GME-02b): a stale/replayed
   * older status is a no-op and a terminal state is never overwritten (DELIVERED is never regressed
   * to a late SENT, nor flipped to FAILED). Idempotent by construction.
   */
  async updateStatus(
    tenantId: string,
    providerMessageId: string,
    status: MessageStatus,
    error?: string,
  ): Promise<void> {
    const msg = await this.db.withTenant(tenantId, (tx) =>
      tx.message.findFirst({ where: { providerMessageId }, select: { id: true, status: true } }),
    );
    if (!msg) return; // unknown provider id (or another tenant's message) — ignore
    if (!shouldAdvanceStatus(msg.status as MessageStatus, status)) return; // stale/replayed/regressive
    await this.db.withTenant(tenantId, (tx) =>
      tx.message.update({
        where: { id: msg.id },
        data: { status, ...(error ? { error } : {}) },
      }),
    );
  }

  // ── Opt-out suppression ─────────────────────────────────────────────────────────

  async isOptedOut(tenantId: string, channel: MessageChannel, phone: string): Promise<boolean> {
    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.messagingOptOut.findFirst({ where: { channel, phone }, select: { id: true } }),
    );
    return Boolean(row);
  }

  async optOut(tenantId: string, channel: MessageChannel, phone: string): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.messagingOptOut.upsert({
        where: { tenantId_channel_phone: { tenantId, channel, phone } },
        create: { tenantId, channel, phone },
        update: {},
      }),
    );
  }

  async optIn(tenantId: string, channel: MessageChannel, phone: string): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.messagingOptOut.deleteMany({ where: { channel, phone } }),
    );
  }

  // ── Reads ────────────────────────────────────────────────────────────────────

  async listMessages(tenantId: string, limit = 50): Promise<MessageRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.message.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 200),
        select: SELECT_MESSAGE,
      }),
    );
    return rows.map(toMessageRow);
  }

  /**
   * Blended-campaign helper: given a finished call's outcome + a campaign's channelMix, send
   * a text follow-up when the mix calls for it. Pure decision in `@vocaliq/shared`; the send
   * is metered + opt-out-checked like any other. Returns the sent message, or null if skipped.
   */
  async blendedFollowUp(
    tenantId: string,
    params: {
      callOutcome: string;
      mix: ChannelMix;
      to: string;
      contactId?: string;
      campaignId?: string;
    },
  ): Promise<MessageRow | null> {
    const step = blendedNextStep(params.callOutcome, params.mix);
    if (!step.sendText || !step.channel || !step.templateId) return null;
    try {
      return await this.send(tenantId, {
        channel: step.channel,
        to: params.to,
        templateId: step.templateId,
        ...(params.contactId ? { contactId: params.contactId } : {}),
        ...(params.campaignId ? { campaignId: params.campaignId } : {}),
      });
    } catch {
      // Opt-out or missing-variable → skip the follow-up, never break the campaign.
      return null;
    }
  }
}

const SELECT_TEMPLATE = {
  id: true,
  channel: true,
  name: true,
  language: true,
  category: true,
  body: true,
  variables: true,
  approvalStatus: true,
  active: true,
  updatedAt: true,
} as const;

const SELECT_MESSAGE = {
  id: true,
  channel: true,
  direction: true,
  status: true,
  toAddr: true,
  body: true,
  costUsd: true,
  error: true,
  createdAt: true,
} as const;

function toTemplateRow(r: {
  id: string;
  channel: MessageChannel;
  name: string;
  language: string;
  category: string;
  body: string;
  variables: string[];
  approvalStatus: string;
  active: boolean;
  updatedAt: Date;
}): MessageTemplateRow {
  return r;
}

function toMessageRow(r: {
  id: string;
  channel: MessageChannel;
  direction: string;
  status: MessageStatus;
  toAddr: string;
  body: string;
  costUsd: number;
  error: string | null;
  createdAt: Date;
}): MessageRow {
  return r;
}
