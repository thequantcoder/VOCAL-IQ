import type { WhatsAppCallingTelephony } from '@vocaliq/provider-router';
import type { PrismaService } from '../db/prisma.service';
import type { WaMediaControl } from './whatsapp-media-control';

/**
 * WhatsApp Business Calling — the CONTROL PLANE (WAC-02). Receives Meta's calling webhooks (routed +
 * HMAC-verified by the messaging webhook seam, tenant from the URL) and drives the inbound signaling
 * handshake via the provider-router adapter, persisting the WhatsApp call lifecycle. Idempotent by
 * WACID, tenant-scoped (`withTenant` → RLS). NO media here — the SDP answer comes from the injected
 * {@link WaMediaControl} (WAC-03); until then the call is recorded as `connecting` (gated pattern).
 */

/** Resolves the tenant's WhatsApp calling adapter (BYOK/managed creds). `null` when unconfigured. */
export type WaAdapterResolver = (tenantId: string) => Promise<WhatsAppCallingTelephony | null>;

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

export class WhatsAppCallingService {
  constructor(
    private readonly db: PrismaService,
    private readonly adapterFor: WaAdapterResolver,
    private readonly media: WaMediaControl,
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

  /** Inbound (or outbound) connect. Inbound: get an SDP answer + pre_accept/accept via the adapter. */
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

    if (input.direction !== 'USER_INITIATED' || !input.sdpOffer) return;

    // Ask the voice service (WAC-03) for an SDP answer, then pre_accept + accept via the adapter.
    const answer = await this.media
      .requestSdpAnswer({
        tenantId,
        callId: input.waCallId,
        sdpOffer: input.sdpOffer,
        ...(input.agentId ? { agentId: input.agentId } : {}),
      })
      .catch(() => null);
    const adapter = answer ? await this.adapterFor(tenantId).catch(() => null) : null;
    if (!answer || !adapter) {
      // Media/creds not ready (WAC-02 gated) — the call stays `connecting`; WAC-03/04 complete it live.
      return;
    }
    await adapter.preAccept({ callId: input.waCallId, sdpAnswer: answer });
    await adapter.accept({ callId: input.waCallId, sdpAnswer: answer });
    await this.setStatus(tenantId, input.waCallId, 'accepted');
  }

  /** Outbound status transitions (RINGING/ACCEPTED/REJECTED). */
  async onStatus(tenantId: string, input: WaStatusInput): Promise<void> {
    const status = input.status.toLowerCase();
    await this.record(tenantId, input.waCallId, 'status', input, { status });
  }

  /** Call ended — persist final status/duration/error and tear down media. */
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

  private async setStatus(tenantId: string, waCallId: string, status: string): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.whatsAppCall.update({
        where: { tenantId_waCallId: { tenantId, waCallId } },
        data: { status },
      }),
    );
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
