import type { WhatsAppCallingTelephony } from '@vocaliq/provider-router';
import {
  type WhatsappCallSettings,
  buildWhatsAppCallBrief,
  decodeWhatsAppCallPayload,
  isWithinWhatsappCallHours,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import { NoopWaCallMeter, type WaCallMeter } from './whatsapp-call-cost.service';
import type { WaInboundRouter, WhatsAppInboundRouting } from './whatsapp-call-routing.service';
import type { WaMediaControl } from './whatsapp-media-control';

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

const norm = (s?: string) => (s && s.length > 0 ? s : undefined);

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

    // Only an inbound user-initiated call with an offer is answered here (outbound legs are elsewhere).
    if (input.direction !== 'USER_INITIATED' || !input.sdpOffer) return;

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
    const unifiedCallId = routing
      ? await this.openUnifiedCall(tenantId, input.waCallId, routing)
      : input.waCallId;

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

  /** Outbound status transitions (RINGING/ACCEPTED/REJECTED). */
  async onStatus(tenantId: string, input: WaStatusInput): Promise<void> {
    const status = input.status.toLowerCase();
    await this.record(tenantId, input.waCallId, 'status', input, { status });
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
  }

  /** A user's permission accept/reject reply (persistence of the grant itself is WAC-08). */
  async onPermissionReply(tenantId: string, waCallId: string, payload: unknown): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCallEvent.create({
        data: {
          tenantId,
          waCallId: waCallId || 'permission',
          event: 'permission_reply',
          payload: (payload ?? {}) as object,
        },
      }),
    );
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
  }

  /** Decode the tapped-button / deep-link context (WAC-07 payload convention) for the answering brief. */
  private contextOf(input: WaConnectInput) {
    return decodeWhatsAppCallPayload(input.ctaPayload ?? input.deeplinkPayload ?? '');
  }

  /** Open the unified Call(channel=WHATSAPP, INBOUND) row and link it back to the WhatsApp call. */
  private async openUnifiedCall(
    tenantId: string,
    waCallId: string,
    routing: WhatsAppInboundRouting,
  ): Promise<string> {
    return this.db.withTenant(tenantId, async (tx) => {
      const created = await tx.call.create({
        data: {
          tenantId,
          agentId: routing.agentId,
          ...(routing.flowVersionId ? { flowVersionId: routing.flowVersionId } : {}),
          direction: 'INBOUND',
          channel: 'WHATSAPP',
          status: 'RINGING',
        },
        select: { id: true },
      });
      await tx.whatsAppCall.update({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        data: { callId: created.id },
      });
      return created.id;
    });
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
