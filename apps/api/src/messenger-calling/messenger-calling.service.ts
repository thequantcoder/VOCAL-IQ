import type { MessengerCallingTelephony } from '@vocaliq/provider-router';
import {
  type MessengerCallSettings,
  buildMessengerCallBrief,
  fromMessengerCallRef,
  isWithinMessengerCallHours,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { MeMediaControl } from './messenger-media-control';

/**
 * Messenger (Meta) Calling — the CONTROL PLANE (MEC-02), the WhatsApp `WhatsAppCallingService` sibling.
 * Receives Meta's Messenger call webhooks (routed + HMAC-verified by the messaging seam, tenant from the
 * URL) and drives the inbound signaling handshake, persisting the Messenger call lifecycle. Idempotent by
 * Meta call id, tenant-scoped (`withTenant` → RLS). NO media here — the SDP answer comes from the injected
 * {@link MeMediaControl} (MEC-03).
 *
 * Identity is a PSID + Page (no phone numbers → no dial-code routing). An optional {@link MeInboundRouter}
 * resolves which agent answers (MEC-04) and, once accepted, a unified `Call(channel=MESSENGER)` is opened
 * + linked so the call flows through recording / transcription / analytics / cost. Both the router and the
 * meter are OPTIONAL: without them the service behaves as a pure MEC-02 control plane (no unified Call, no
 * metering) so this slice's tests stay green. Outbound + permissions are MEC-08; the Messenger webhook
 * wire shape is `[CONFIRM @ MEC-00]` and lives in the dispatcher, not here.
 */

/** Resolves the tenant's Messenger calling adapter (managed/BYOK creds). `null` when unconfigured. */
export type MeAdapterResolver = (tenantId: string) => Promise<MessengerCallingTelephony | null>;

/** Meters a terminated Messenger call's carrier cost (MEC-06). */
export interface MeCallMeter {
  meterTerminated(tenantId: string, meCallId: string): Promise<void>;
}
/** No-op meter — the default so the MEC-02 control-plane tests stay offline (real metering is MEC-06). */
export class NoopMeCallMeter implements MeCallMeter {
  async meterTerminated(): Promise<void> {
    /* MEC-06 wires the real cost service */
  }
}

/** The answering agent's brain for a routed Messenger call (resolved by the router in MEC-04). */
export interface MessengerInboundRouting {
  agentId: string;
  flowVersionId?: string;
  systemPrompt?: string;
  greeting?: string;
}
/** Resolves which PUBLISHED agent answers an inbound Messenger call (MEC-04). */
export interface MeInboundRouter {
  resolveInboundAgent(tenantId: string, pageId?: string): Promise<MessengerInboundRouting | null>;
}

/** Reads the tenant's Messenger call settings (for the availability-hours gate, MEC-05). */
export type MeSettingsReader = (tenantId: string) => Promise<MessengerCallSettings>;

export interface MeConnectInput {
  meCallId: string;
  direction: 'USER_INITIATED' | 'BUSINESS_INITIATED';
  psid?: string;
  pageId?: string;
  /** m.me / call-button `ref` context payload (the agent greets with it). */
  refPayload?: string;
  /** Caller's SDP offer (inbound) — needs an answer to accept. */
  sdpOffer?: string;
  /** User's SDP answer (outbound connect webhook) — applied to the Page media leg. */
  sdpAnswer?: string;
  agentId?: string;
}

export interface MeStatusInput {
  meCallId: string;
  status: string; // RINGING | ACCEPTED | REJECTED
}

export interface MeTerminateInput {
  meCallId: string;
  status?: string; // Completed | Failed
  startTime?: number;
  endTime?: number;
  durationSec?: number;
  errorCode?: number;
}

const norm = (s?: string) => (s && s.length > 0 ? s : undefined);

const COMPONENT_KEYS = ['stt', 'llm', 'tts', 'telephony'] as const;

/** Merge the Messenger carrier cost into a call's costBreakdown without clobbering any AI-loop components. */
function withTelephonyCost(existing: unknown, telephonyUsd: number): Record<string, number> {
  const cb: Record<string, number> =
    existing && typeof existing === 'object' ? { ...(existing as Record<string, number>) } : {};
  cb.telephony = telephonyUsd;
  cb.total = COMPONENT_KEYS.reduce((s, k) => s + (typeof cb[k] === 'number' ? cb[k] : 0), 0);
  cb.billable = cb.total;
  return cb;
}

export class MessengerCallingService {
  constructor(
    private readonly db: PrismaService,
    private readonly adapterFor: MeAdapterResolver,
    private readonly media: MeMediaControl,
    /** Cost metering (MEC-06). Defaults to a no-op so the MEC-02 control-plane tests stay offline. */
    private readonly meter: MeCallMeter = new NoopMeCallMeter(),
    /** Inbound agent routing (MEC-04). Absent → no routing + no unified Call (pure MEC-02 behaviour). */
    private readonly router: MeInboundRouter | null = null,
    /** Availability-hours source (MEC-05). Absent → always open (MEC-02/04 behaviour). */
    private readonly settingsReader: MeSettingsReader | null = null,
    /** Clock — injectable so timestamps are deterministic in tests. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Idempotent upsert of the Messenger call row + an append-only event, all in the tenant's RLS scope. */
  private async record(
    tenantId: string,
    meCallId: string,
    event: string,
    payload: unknown,
    call: Record<string, unknown>,
  ): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      await tx.messengerCall.upsert({
        where: { tenantId_meCallId: { tenantId, meCallId } },
        create: { tenantId, meCallId, direction: 'USER_INITIATED', ...call },
        update: call,
      });
      await tx.messengerCallEvent.create({
        data: { tenantId, meCallId, event, payload: (payload ?? {}) as object },
      });
    });
  }

  /** Inbound (or outbound) connect. Inbound: route → answer → accept + open a unified Call. */
  async onConnect(tenantId: string, input: MeConnectInput): Promise<void> {
    await this.record(tenantId, input.meCallId, 'connect', input, {
      direction: input.direction,
      status: 'connecting',
      ...(norm(input.psid) ? { psid: input.psid } : {}),
      ...(norm(input.pageId) ? { pageId: input.pageId } : {}),
      ...(norm(input.refPayload) ? { refPayload: input.refPayload } : {}),
    });

    // Outbound (Page-initiated, MEC-08): the connect webhook carries the USER's SDP answer → apply it to
    // our already-open media leg. The call was placed by MEC-08's placeOutboundCall.
    if (input.direction === 'BUSINESS_INITIATED') {
      if (input.sdpAnswer) {
        const me = await this.db.withTenant(tenantId, (tx) =>
          tx.messengerCall.findUnique({
            where: { tenantId_meCallId: { tenantId, meCallId: input.meCallId } },
            select: { callId: true },
          }),
        );
        if (me?.callId) await this.media.applyAnswer(me.callId, input.sdpAnswer).catch(() => {});
      }
      return;
    }

    // Inbound: only a user-initiated call with an offer is answered here.
    if (!input.sdpOffer) return;

    // Availability gate (MEC-05) — outside the Page's calling hours → reject gracefully.
    if (this.settingsReader) {
      const settings = await this.settingsReader(tenantId).catch(() => null);
      if (settings && !isWithinMessengerCallHours(settings, this.now())) {
        await this.rejectWithReason(tenantId, input.meCallId, 'outside_calling_hours');
        return;
      }
    }

    // Resolve the answering agent (MEC-04). No publishable agent → reject gracefully.
    let routing: MessengerInboundRouting | null = null;
    if (this.router) {
      routing = await this.router.resolveInboundAgent(tenantId, input.pageId).catch(() => null);
      if (!routing) {
        await this.rejectWithReason(tenantId, input.meCallId, 'no_agent_available');
        return;
      }
    }

    // Open the unified Call up-front (when routed) so media/transcript/cost attach to its id.
    let unifiedCallId = input.meCallId;
    if (routing) {
      unifiedCallId = await this.createUnifiedCall(tenantId, routing, 'INBOUND');
      await this.linkMessengerCall(tenantId, input.meCallId, unifiedCallId);
    }

    // Compose the answering system prompt = the agent's persona + the tapped-button context brief.
    const brief = buildMessengerCallBrief(fromMessengerCallRef(input.refPayload ?? ''));
    const systemPrompt = routing
      ? [routing.systemPrompt, brief].filter((s) => s?.trim()).join('\n\n') || undefined
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
    await adapter.preAccept({ callId: input.meCallId, sdpAnswer: answer });
    await adapter.accept({ callId: input.meCallId, sdpAnswer: answer });
    await this.setStatus(tenantId, input.meCallId, 'accepted');
    if (routing) await this.markUnifiedInProgress(tenantId, unifiedCallId);
  }

  /** Outbound status transitions (RINGING/ACCEPTED/REJECTED) — mirror onto the linked unified Call. */
  async onStatus(tenantId: string, input: MeStatusInput): Promise<void> {
    const status = input.status.toLowerCase();
    await this.record(tenantId, input.meCallId, 'status', input, { status });
    if (status !== 'accepted' && status !== 'rejected') return;
    const me = await this.db.withTenant(tenantId, (tx) =>
      tx.messengerCall.findUnique({
        where: { tenantId_meCallId: { tenantId, meCallId: input.meCallId } },
        select: { callId: true },
      }),
    );
    if (!me?.callId) return;
    if (status === 'accepted') await this.markUnifiedInProgress(tenantId, me.callId);
    else await this.failUnifiedCall(tenantId, me.callId, 'rejected');
  }

  /** Call ended — persist final status/duration/error, tear down media, meter cost, close the Call. */
  async onTerminate(tenantId: string, input: MeTerminateInput): Promise<void> {
    const status = (input.status ?? '').toLowerCase() === 'failed' ? 'failed' : 'completed';
    await this.record(tenantId, input.meCallId, 'terminate', input, {
      status,
      ...(input.startTime ? { startedAt: new Date(input.startTime * 1000) } : {}),
      ...(input.endTime ? { endedAt: new Date(input.endTime * 1000) } : {}),
      ...(input.durationSec !== undefined ? { durationSec: input.durationSec } : {}),
      ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    });
    await this.media.endCall(input.meCallId).catch(() => {});
    // Meter the call cost (golden rule #4). Idempotent by `billedAt` (MEC-06), so a webhook retry safely
    // re-meters to a single UsageRecord.
    await this.meter.meterTerminated(tenantId, input.meCallId);
    // Close the linked unified Call (MEC-04) — final status + duration + carrier cost. No-op if none.
    await this.closeUnifiedCall(tenantId, input.meCallId);
  }

  /** Settings-update notifications (call-button visibility / availability; alerts are MEC-05). */
  async onAccountEvent(
    tenantId: string,
    event: 'settings_update',
    payload: unknown,
  ): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.messengerCallEvent.create({
        data: { tenantId, meCallId: 'account', event, payload: (payload ?? {}) as object },
      }),
    );
  }

  /** Create a unified Call(channel=MESSENGER) row for a routed call. Returns its id. */
  private async createUnifiedCall(
    tenantId: string,
    routing: MessengerInboundRouting,
    direction: 'INBOUND' | 'OUTBOUND',
  ): Promise<string> {
    return this.db.withTenant(tenantId, async (tx) => {
      const created = await tx.call.create({
        data: {
          tenantId,
          agentId: routing.agentId,
          ...(routing.flowVersionId ? { flowVersionId: routing.flowVersionId } : {}),
          direction,
          channel: 'MESSENGER',
          status: 'RINGING',
        },
        select: { id: true },
      });
      return created.id;
    });
  }

  /** Link a Messenger call row to its unified Call id (best-effort). */
  private async linkMessengerCall(
    tenantId: string,
    meCallId: string,
    callId: string,
  ): Promise<void> {
    await this.db
      .withTenant(tenantId, (tx) =>
        tx.messengerCall.update({
          where: { tenantId_meCallId: { tenantId, meCallId } },
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
  private async closeUnifiedCall(tenantId: string, meCallId: string): Promise<void> {
    await this.db.withTenant(tenantId, async (tx) => {
      const me = await tx.messengerCall.findUnique({
        where: { tenantId_meCallId: { tenantId, meCallId } },
        select: { callId: true, status: true, durationSec: true, costUsd: true },
      });
      if (!me?.callId) return;
      const call = await tx.call.findFirst({
        where: { id: me.callId },
        select: { costBreakdown: true },
      });
      if (!call) return;
      await tx.call.update({
        where: { id: me.callId },
        data: {
          status: me.status === 'failed' ? 'FAILED' : 'COMPLETED',
          endedAt: this.now(),
          ...(me.durationSec !== null ? { durationSec: me.durationSec } : {}),
          costBreakdown: withTelephonyCost(call.costBreakdown, me.costUsd ?? 0),
        },
      });
    });
  }

  private async setStatus(tenantId: string, meCallId: string, status: string): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.messengerCall.update({
        where: { tenantId_meCallId: { tenantId, meCallId } },
        data: { status },
      }),
    );
  }

  /** Reject the call via the adapter (if any) + record the reason as a lifecycle event. */
  private async rejectWithReason(
    tenantId: string,
    meCallId: string,
    reason: string,
  ): Promise<void> {
    const adapter = await this.adapterFor(tenantId).catch(() => null);
    if (adapter) await adapter.reject(meCallId).catch(() => {});
    await this.db.withTenant(tenantId, async (tx) => {
      await tx.messengerCall.update({
        where: { tenantId_meCallId: { tenantId, meCallId } },
        data: { status: 'rejected' },
      });
      await tx.messengerCallEvent.create({
        data: { tenantId, meCallId, event: 'rejected', payload: { reason } },
      });
    });
  }

  /** Operator-initiated reject/terminate (config-writer routes) — passthrough to the adapter. */
  async reject(tenantId: string, meCallId: string): Promise<void> {
    const adapter = await this.adapterFor(tenantId);
    if (adapter) await adapter.reject(meCallId);
    await this.setStatus(tenantId, meCallId, 'rejected').catch(() => {});
  }
  async terminate(tenantId: string, meCallId: string): Promise<void> {
    const adapter = await this.adapterFor(tenantId);
    if (adapter) await adapter.terminate(meCallId);
  }
}
