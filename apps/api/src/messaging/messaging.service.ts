import {
  type ChannelMix,
  type InboundIntent,
  type MessageChannel,
  type MessageStatus,
  type MessageTemplateInput,
  NotFoundError,
  ValidationError,
  blendedNextStep,
  classifyInbound,
  extractTemplateVars,
  messageCostUsd,
  renderMessageTemplate,
  shouldAdvanceStatus,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { ResolvedMessagingCreds } from './messaging-key-vault';
import { type ProviderFactory, createMessagingProvider } from './provider-factory';
import { defaultProviderForChannel } from './provider-specs';
import { type HttpClient, fetchHttp } from './senders';

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
}

export class MessagingService {
  private readonly http: HttpClient;
  private readonly factory: ProviderFactory;
  constructor(
    private readonly db: PrismaService,
    private readonly credsResolver: MessagingCredsResolver,
    opts?: { http?: HttpClient; providerFactory?: ProviderFactory },
  ) {
    this.http = opts?.http ?? fetchHttp;
    this.factory = opts?.providerFactory ?? createMessagingProvider;
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
    if (await this.isOptedOut(tenantId, input.channel, input.to)) {
      throw new ValidationError('Recipient has opted out of this channel');
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
    // GME-02a: pick the provider for this channel (GME-03 will route per country/cost/health),
    // resolve its credentials BYOK-first (tenant vault → platform row → env), and dispatch with those
    // creds so a tenant's own keys actually drive the send.
    const providerId = defaultProviderForChannel(input.channel);
    const resolved = providerId ? await this.credsResolver.resolve(tenantId, providerId) : null;

    // Dispatch (or queue if no provider is configured for this tenant — gated).
    let status: MessageStatus = 'QUEUED';
    let providerMessageId: string | undefined;
    let usedProviderId: string | undefined;
    let error: string | undefined;
    if (resolved) {
      const adapter = this.factory(resolved.providerId, resolved.creds, this.http);
      if (adapter) {
        const result = await adapter.send({
          to: input.to,
          body,
          ...(templateName ? { templateName } : {}),
          ...(language ? { language } : {}),
        });
        status = result.status;
        providerMessageId = result.providerMessageId;
        usedProviderId = resolved.providerId;
        error = result.error;
      } else {
        error = `Provider ${resolved.providerId} is not implemented`;
      }
    } else {
      error = 'No messaging provider configured for this channel';
    }

    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.message.create({
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
        },
        select: SELECT_MESSAGE,
      }),
    );
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
