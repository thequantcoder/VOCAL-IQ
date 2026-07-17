import { WHATSAPP_NO_PERMISSION_CODE, whatsappErrorCode } from '@vocaliq/provider-router';
import type { WhatsAppCallingTelephony } from '@vocaliq/provider-router';
import {
  ProviderError,
  ValidationError,
  type WaCallBlockReason,
  type WhatsappCallSettings,
  buildWhatsAppCallBrief,
  decodeWhatsAppCallPayload,
  isWithinWhatsappCallHours,
  normalizeWaNumber,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import { NoopWaCallMeter, type WaCallMeter } from './whatsapp-call-cost.service';
import type { WaInboundRouter, WhatsAppInboundRouting } from './whatsapp-call-routing.service';
import type { WaMediaControl } from './whatsapp-media-control';
import type { WaPermissionGate, WaPermissionReply } from './whatsapp-permission.service';

/**
 * WhatsApp Business Calling — the CONTROL PLANE (WAC-02 → WAC-04). Receives Meta's calling webhooks
 * (routed + HMAC-verified by the messaging seam, tenant from the URL) and drives the inbound signaling
 * handshake, persisting the WhatsApp call lifecycle. Idempotent by WACID, tenant-scoped (`withTenant` →
 * RLS). NO media here — the SDP answer comes from the injected {@link WaMediaControl} (WAC-03).
 *
 * WAC-04 (inbound GA) adds the answering brain: an optional {@link WaInboundRouter} resolves which
 * agent answers, a {@link WaSettingsReader} enforces calling hours, the tapped-button context is
 * decoded into a brief the agent opens with, and — once accepted — a unified `Call(channel=WHATSAPP)`
 * row is opened + linked so the call flows through recording / transcription / analytics / cost like any
 * other. Both the router + settings reader are OPTIONAL: without them the service behaves exactly as in
 * WAC-02/03 (no routing, always-open, no unified Call) so those slices' tests stay green.
 */

/** Resolves the tenant's WhatsApp calling adapter (BYOK/managed creds). `null` when unconfigured. */
export type WaAdapterResolver = (tenantId: string) => Promise<WhatsAppCallingTelephony | null>;

/** Reads the tenant's WhatsApp call settings (for the calling-hours gate). */
export type WaSettingsReader = (tenantId: string) => Promise<WhatsappCallSettings>;

export interface WaConnectInput {
  waCallId: string;
  direction: 'USER_INITIATED' | 'BUSINESS_INITIATED';
  from?: string;
  to?: string;
  waUserId?: string;
  ctaPayload?: string;
  deeplinkPayload?: string;
  /** Caller's SDP offer (inbound) — needs an answer to accept. */
  sdpOffer?: string;
  /** User's SDP answer (outbound connect webhook) — applied to the business media leg. */
  sdpAnswer?: string;
  agentId?: string;
}

export interface WaStatusInput {
  waCallId: string;
  status: string; // RINGING | ACCEPTED | REJECTED
}

export interface WaTerminateInput {
  waCallId: string;
  status?: string; // Completed | Failed
  startTime?: number;
  endTime?: number;
  durationSec?: number;
  errorCode?: number;
}

export interface WaPlaceOutboundInput {
  /** The user's WhatsApp number to call. */
  to: string;
  agentId: string;
  contactId?: string;
  /** The BUSINESS number's E.164 (for the country-block gate). */
  businessE164?: string;
}

const norm = (s?: string) => (s && s.length > 0 ? s : undefined);

/** Operator-facing message for each pre-dial block reason (the compliance gate, WAC-08). */
function outboundBlockedMessage(reason: WaCallBlockReason | undefined): string {
  switch (reason) {
    case 'dnc':
      return 'This contact is on the do-not-call list.';
    case 'blocked_country':
      return 'Outbound WhatsApp calling is blocked from this business number’s country.';
    case 'no_permission':
      return 'This user has not granted call permission — request permission first.';
    case 'permission_expired':
      return 'Call permission has expired — request permission again.';
    case 'unanswered_backoff':
      return 'Too many consecutive unanswered calls — pausing to avoid an auto-revoke.';
    case 'daily_connected_cap':
      return 'The 100 connected-calls-per-day limit for this user has been reached.';
    default:
      return 'This call is not permitted right now.';
  }
}

const COMPONENT_KEYS = ['stt', 'llm', 'tts', 'telephony'] as const;

/** Merge the WhatsApp carrier cost into a call's costBreakdown without clobbering any AI-loop components. */
function withTelephonyCost(existing: unknown, telephonyUsd: number): Record<string, number> {
  const cb: Record<string, number> =
    existing && typeof existing === 'object' ? { ...(existing as Record<string, number>) } : {};
  cb.telephony = telephonyUsd;
  cb.total = COMPONENT_KEYS.reduce((s, k) => s + (typeof cb[k] === 'number' ? cb[k] : 0), 0);
  cb.billable = cb.total;
  return cb;
}

export class WhatsAppCallingService {
  constructor(
    private readonly db: PrismaService,
    private readonly adapterFor: WaAdapterResolver,
    private readonly media: WaMediaControl,
    /** Cost metering (WAC-06). Defaults to a no-op so the WAC-02 control-plane tests stay offline. */
    private readonly meter: WaCallMeter = new NoopWaCallMeter(),
    /** Inbound agent routing (WAC-04). Absent → no routing + no unified Call (WAC-02/03 behaviour). */
    private readonly router: WaInboundRouter | null = null,
    /** Calling-hours source (WAC-04). Absent → always open (WAC-02/03 behaviour). */
    private readonly settingsReader: WaSettingsReader | null = null,
    /** Outbound permission governor (WAC-08). Absent → no outbound (dialing throws). */
    private readonly permission: WaPermissionGate | null = null,
    /** Restriction handler (WAC-09) — persists an `account_update` restriction. Absent → audit only. */
    private readonly restrictionHandler:
      | ((tenantId: string, payload: unknown) => Promise<void>)
      | null = null,
    /** Clock — injectable so the hours gate + timestamps are deterministic in tests. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Idempotent upsert of the WhatsApp call row + an append-only event, all in the tenant's RLS scope. */
  private async record(
    tenantId: string,
    waCallId: string,
    event: string,
    payload: unknown,
    call: Record<string, unknown>,
  ): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      await tx.whatsAppCall.upsert({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        create: { tenantId, waCallId, direction: 'USER_INITIATED', ...call },
        update: call,
      });
      await tx.whatsAppCallEvent.create({
        data: { tenantId, waCallId, event, payload: (payload ?? {}) as object },
      });
    });
  }

  /** Inbound (or outbound) connect. Inbound: route → hours-gate → answer → accept + open a unified Call. */
  async onConnect(tenantId: string, input: WaConnectInput): Promise<void> {
    await this.record(tenantId, input.waCallId, 'connect', input, {
      direction: input.direction,
      status: 'connecting',
      ...(norm(input.from) ? { fromNumber: input.from } : {}),
      ...(norm(input.to) ? { toNumber: input.to } : {}),
      ...(norm(input.waUserId) ? { waUserId: input.waUserId } : {}),
      ...(norm(input.ctaPayload) ? { ctaPayload: input.ctaPayload } : {}),
      ...(norm(input.deeplinkPayload) ? { deeplinkPayload: input.deeplinkPayload } : {}),
    });

    // Outbound (business-initiated): the Connect webhook carries the USER's SDP answer → apply it to
    // our already-open media leg (WAC-08). The call was placed by `placeOutboundCall`.
    if (input.direction === 'BUSINESS_INITIATED') {
      if (input.sdpAnswer) {
        const wa = await this.db.withTenant(tenantId, (tx) =>
          tx.whatsAppCall.findUnique({
            where: { tenantId_waCallId: { tenantId, waCallId: input.waCallId } },
            select: { callId: true },
          }),
        );
        if (wa?.callId) await this.media.applyAnswer(wa.callId, input.sdpAnswer).catch(() => {});
      }
      return;
    }

    // Inbound: only a user-initiated call with an offer is answered here.
    if (!input.sdpOffer) return;

    // Calling-hours gate (WAC-04) — outside hours → reject gracefully (deflect/voicemail is WAC-05/08).
    if (this.settingsReader) {
      const settings = await this.settingsReader(tenantId).catch(() => null);
      if (settings && !isWithinWhatsappCallHours(settings, this.now())) {
        await this.rejectWithReason(tenantId, input.waCallId, 'outside_calling_hours');
        return;
      }
    }

    // Resolve the answering agent (WAC-04). No publishable agent → reject gracefully.
    let routing: WhatsAppInboundRouting | null = null;
    if (this.router) {
      routing = await this.router.resolveInboundAgent(tenantId, input.to).catch(() => null);
      if (!routing) {
        await this.rejectWithReason(tenantId, input.waCallId, 'no_agent_available');
        return;
      }
    }

    // Open the unified Call up-front (when routed) so the media/transcript/cost attach to its id.
    let unifiedCallId = input.waCallId;
    if (routing) {
      unifiedCallId = await this.createUnifiedCall(tenantId, routing, 'INBOUND');
      await this.linkWhatsAppCall(tenantId, input.waCallId, unifiedCallId);
    }

    // Compose the answering system prompt = the agent's persona + the tapped-button context brief.
    const brief = buildWhatsAppCallBrief(this.contextOf(input));
    const systemPrompt = routing
      ? [routing.systemPrompt, brief].filter((s) => s.trim()).join('\n\n') || undefined
      : undefined;
    const agentId = routing?.agentId ?? input.agentId;

    const answer = await this.media
      .requestSdpAnswer({
        tenantId,
        callId: unifiedCallId,
        sdpOffer: input.sdpOffer,
        ...(agentId ? { agentId } : {}),
        ...(systemPrompt ? { systemPrompt } : {}),
        ...(routing?.greeting ? { greeting: routing.greeting } : {}),
      })
      .catch(() => null);
    const adapter = answer ? await this.adapterFor(tenantId).catch(() => null) : null;
    if (!answer || !adapter) {
      // Media/creds not ready (gated) — leave `connecting`; a unified Call we opened is marked failed.
      if (routing) await this.failUnifiedCall(tenantId, unifiedCallId, 'media_unavailable');
      return;
    }
    await adapter.preAccept({ callId: input.waCallId, sdpAnswer: answer });
    await adapter.accept({ callId: input.waCallId, sdpAnswer: answer });
    await this.setStatus(tenantId, input.waCallId, 'accepted');
    if (routing) await this.markUnifiedInProgress(tenantId, unifiedCallId);
  }

  /** Outbound status transitions (RINGING/ACCEPTED/REJECTED) — mirror onto the linked unified Call. */
  async onStatus(tenantId: string, input: WaStatusInput): Promise<void> {
    const status = input.status.toLowerCase();
    await this.record(tenantId, input.waCallId, 'status', input, { status });
    if (status !== 'accepted' && status !== 'rejected') return;
    const wa = await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCall.findUnique({
        where: { tenantId_waCallId: { tenantId, waCallId: input.waCallId } },
        select: { callId: true },
      }),
    );
    if (!wa?.callId) return;
    if (status === 'accepted') await this.markUnifiedInProgress(tenantId, wa.callId);
    else await this.failUnifiedCall(tenantId, wa.callId, 'rejected');
  }

  /** Call ended — persist final status/duration/error, tear down media, meter cost, close the Call. */
  async onTerminate(tenantId: string, input: WaTerminateInput): Promise<void> {
    const status = (input.status ?? '').toLowerCase() === 'failed' ? 'failed' : 'completed';
    await this.record(tenantId, input.waCallId, 'terminate', input, {
      status,
      ...(input.startTime ? { startedAt: new Date(input.startTime * 1000) } : {}),
      ...(input.endTime ? { endedAt: new Date(input.endTime * 1000) } : {}),
      ...(input.durationSec !== undefined ? { durationSec: input.durationSec } : {}),
      ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    });
    await this.media.endCall(input.waCallId).catch(() => {});
    // Meter the call cost (golden rule #4). Runs after the lifecycle row is persisted (with duration);
    // idempotent by `billedAt`, so a webhook retry safely re-meters to a single UsageRecord.
    await this.meter.meterTerminated(tenantId, input.waCallId);
    // Close the linked unified Call (WAC-04) — final status + duration + carrier cost. No-op if none.
    await this.closeUnifiedCall(tenantId, input.waCallId);
    // Outbound auto-revoke back-off (WAC-08): record whether this call was answered.
    await this.recordOutboundOutcome(tenantId, input.waCallId);
  }

  /** For an outbound call, feed the answered/unanswered signal to the permission back-off engine. */
  private async recordOutboundOutcome(tenantId: string, waCallId: string): Promise<void> {
    if (!this.permission) return;
    const wa = await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCall.findUnique({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        select: { direction: true, toNumber: true, durationSec: true },
      }),
    );
    if (wa?.direction !== 'BUSINESS_INITIATED' || !wa.toNumber) return;
    await this.permission
      .recordCallOutcome(tenantId, wa.toNumber, (wa.durationSec ?? 0) > 0)
      .catch(() => {});
  }

  /** A user's permission accept/reject reply — audit it AND persist the grant (WAC-08). */
  async onPermissionReply(
    tenantId: string,
    waId: string,
    reply: WaPermissionReply | null,
    rawPayload?: unknown,
  ): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCallEvent.create({
        data: {
          tenantId,
          waCallId: 'permission',
          event: 'permission_reply',
          payload: (rawPayload ?? reply ?? {}) as object,
        },
      }),
    );
    if (this.permission && waId && reply) {
      await this.permission.recordPermissionReply(tenantId, waId, reply).catch(() => {});
    }
  }

  /**
   * Place a CONSENTED outbound WhatsApp call (WAC-08). Runs the compliance gate FIRST (permission,
   * expiry, ≤100/day, blocked country, unanswered back-off, DNC); only then opens a unified Call, asks
   * the bridge for a business SDP offer, and dials via the adapter. Throws a typed ValidationError when
   * blocked, or a ProviderError when the media/creds aren't ready (gated). Metering happens on terminate.
   */
  async placeOutboundCall(
    tenantId: string,
    input: WaPlaceOutboundInput,
  ): Promise<{ waCallId: string; callId: string; status: string }> {
    if (!this.permission) throw new ProviderError('Outbound WhatsApp calling is not available.');
    const waId = normalizeWaNumber(input.to);
    if (!waId) throw new ValidationError('A WhatsApp number is required.');

    // 1. The pre-dial compliance gate — never dial when blocked.
    const gate = await this.permission.canCall(tenantId, {
      waId,
      ...(input.businessE164 ? { businessE164: input.businessE164 } : {}),
      ...(input.contactId ? { contactId: input.contactId } : {}),
    });
    if (!gate.allowed) throw new ValidationError(outboundBlockedMessage(gate.reason));

    // 2. Resolve the answering agent's brain.
    const routing = this.router
      ? await this.router.resolveAgentById(tenantId, input.agentId)
      : null;
    if (!routing) throw new ValidationError('Agent not found or not published.');

    // 3. Open the unified Call, then get the business SDP offer + dial.
    const callId = await this.createUnifiedCall(tenantId, routing, 'OUTBOUND');
    const offer = await this.media
      .requestSdpOffer({
        tenantId,
        callId,
        agentId: routing.agentId,
        ...(routing.systemPrompt ? { systemPrompt: routing.systemPrompt } : {}),
        ...(routing.greeting ? { greeting: routing.greeting } : {}),
      })
      .catch(() => null);
    const adapter = offer ? await this.adapterFor(tenantId).catch(() => null) : null;
    if (!offer || !adapter) {
      await this.failUnifiedCall(tenantId, callId, 'media_unavailable');
      throw new ProviderError('WhatsApp outbound media/credentials are not configured.');
    }

    let waCallId: string;
    try {
      ({ waCallId } = await adapter.placeCall({ to: waId, sdpOffer: offer, callbackData: callId }));
    } catch (err) {
      await this.failUnifiedCall(tenantId, callId, 'dial_failed');
      // Meta 138006 → permission lapsed between the gate and the dial; surface it cleanly.
      if (whatsappErrorCode(err) === WHATSAPP_NO_PERMISSION_CODE) {
        throw new ValidationError(outboundBlockedMessage('no_permission'));
      }
      throw err;
    }

    // 4. Persist the WhatsApp call row (BUSINESS_INITIATED) linked to the unified Call.
    await this.record(tenantId, waCallId, 'connect', input, {
      direction: 'BUSINESS_INITIATED',
      status: 'ringing',
      toNumber: waId,
      callId,
    });
    return { waCallId, callId, status: 'ringing' };
  }

  /** Settings-update / account-restriction notifications (alerts + remediation are WAC-05/09). */
  async onAccountEvent(
    tenantId: string,
    event: 'settings_update' | 'restriction',
    payload: unknown,
  ): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCallEvent.create({
        data: { tenantId, waCallId: 'account', event, payload: (payload ?? {}) as object },
      }),
    );
    // WAC-09: persist a restriction so routing steers around it + the health widget surfaces it.
    if (event === 'restriction' && this.restrictionHandler) {
      await this.restrictionHandler(tenantId, payload).catch(() => {});
    }
  }

  /** Decode the tapped-button / deep-link context (WAC-07 payload convention) for the answering brief. */
  private contextOf(input: WaConnectInput) {
    return decodeWhatsAppCallPayload(input.ctaPayload ?? input.deeplinkPayload ?? '');
  }

  /** Create a unified Call(channel=WHATSAPP) row for a routed call. Returns its id. */
  private async createUnifiedCall(
    tenantId: string,
    routing: WhatsAppInboundRouting,
    direction: 'INBOUND' | 'OUTBOUND',
  ): Promise<string> {
    return this.db.withTenant(tenantId, async (tx) => {
      const created = await tx.call.create({
        data: {
          tenantId,
          agentId: routing.agentId,
          ...(routing.flowVersionId ? { flowVersionId: routing.flowVersionId } : {}),
          direction,
          channel: 'WHATSAPP',
          status: 'RINGING',
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  /** Link a WhatsApp call row to its unified Call id (best-effort). */
  private async linkWhatsAppCall(
    tenantId: string,
    waCallId: string,
    callId: string,
  ): Promise<void> {
    await this.db
      .withTenant(tenantId, (tx) =>
        tx.whatsAppCall.update({
          where: { tenantId_waCallId: { tenantId, waCallId } },
          data: { callId },
        }),
      )
      .catch(() => {});
  }

  private async markUnifiedInProgress(tenantId: string, callId: string): Promise<void> {
    await this.db
      .withTenant(tenantId, (tx) =>
        tx.call.update({
          where: { id: callId },
          data: { status: 'IN_PROGRESS', startedAt: this.now() },
        }),
      )
      .catch(() => {});
  }

  private async failUnifiedCall(
    tenantId: string,
    callId: string,
    disposition: string,
  ): Promise<void> {
    await this.db
      .withTenant(tenantId, (tx) =>
        tx.call.update({
          where: { id: callId },
          data: { status: 'FAILED', disposition, endedAt: this.now() },
        }),
      )
      .catch(() => {});
  }

  /** On terminate, mirror the final outcome (status/duration/carrier cost) onto the linked unified Call. */
  private async closeUnifiedCall(tenantId: string, waCallId: string): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      const wa = await tx.whatsAppCall.findUnique({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        select: { callId: true, status: true, durationSec: true, costUsd: true },
      });
      if (!wa?.callId) return;
      const call = await tx.call.findFirst({
        where: { id: wa.callId },
        select: { costBreakdown: true },
      });
      if (!call) return;
      await tx.call.update({
        where: { id: wa.callId },
        data: {
          status: wa.status === 'failed' ? 'FAILED' : 'COMPLETED',
          endedAt: this.now(),
          ...(wa.durationSec !== null ? { durationSec: wa.durationSec } : {}),
          costBreakdown: withTelephonyCost(call.costBreakdown, wa.costUsd ?? 0),
        },
      });
    });
  }

  private async setStatus(tenantId: string, waCallId: string, status: string): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCall.update({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        data: { status },
      }),
    );
  }

  /** Reject the call via the adapter (if any) + record the reason as a lifecycle event. */
  private async rejectWithReason(
    tenantId: string,
    waCallId: string,
    reason: string,
  ): Promise<void> {
    const adapter = await this.adapterFor(tenantId).catch(() => null);
    if (adapter) await adapter.reject(waCallId).catch(() => {});
    await this.db.withTenant(tenantId, async (tx) => {
      await tx.whatsAppCall.update({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        data: { status: 'rejected' },
      });
      await tx.whatsAppCallEvent.create({
        data: { tenantId, waCallId, event: 'rejected', payload: { reason } },
      });
    });
  }

  /** Operator-initiated reject/terminate (config-writer routes) — passthrough to the adapter. */
  async reject(tenantId: string, waCallId: string): Promise<void> {
    const adapter = await this.adapterFor(tenantId);
    if (adapter) await adapter.reject(waCallId);
    await this.setStatus(tenantId, waCallId, 'rejected').catch(() => {});
  }
  async terminate(tenantId: string, waCallId: string): Promise<void> {
    const adapter = await this.adapterFor(tenantId);
    if (adapter) await adapter.terminate(waCallId);
  }
}
