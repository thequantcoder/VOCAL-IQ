import type { WaConnectInput, WhatsAppCallingService } from './whatsapp-calling.service';

/**
 * Parse the calling-relevant parts of a (already HMAC-verified) Meta WABA webhook and dispatch them
 * to the {@link WhatsAppCallingService} (WAC-02). Best-effort + idempotent by WACID: message-status /
 * text handling stays in the messaging handler; this only touches `field:"calls"`, call-type statuses,
 * `call_permission_reply` interactives, and account settings/restriction changes. The `tenantId`
 * comes from the webhook URL (the messaging seam), so no cross-tenant lookup is needed.
 */

interface WaCall {
  id?: string;
  event?: string;
  direction?: string;
  from?: string;
  to?: string;
  from_user_id?: string;
  to_user_id?: string;
  cta_payload?: string;
  deeplink_payload?: string;
  session?: { sdp_type?: string; sdp?: string };
  status?: string | string[];
  start_time?: string | number;
  end_time?: string | number;
  duration?: number;
}
interface WaStatus {
  id?: string;
  type?: string;
  status?: string;
}
interface WaMessage {
  interactive?: { type?: string };
  context?: { id?: string };
}
interface MetaWabaWebhook {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: { calls?: WaCall[]; statuses?: WaStatus[]; messages?: WaMessage[] };
    }>;
  }>;
}

const num = (v: string | number | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
};

function mapConnect(c: WaCall): WaConnectInput {
  const isBusiness = c.direction === 'BUSINESS_INITIATED';
  return {
    waCallId: c.id ?? '',
    direction: isBusiness ? 'BUSINESS_INITIATED' : 'USER_INITIATED',
    ...(c.from ? { from: c.from } : {}),
    ...(c.to ? { to: c.to } : {}),
    ...((c.from_user_id ?? c.to_user_id) ? { waUserId: c.from_user_id ?? c.to_user_id } : {}),
    ...(c.cta_payload ? { ctaPayload: c.cta_payload } : {}),
    ...(c.deeplink_payload ? { deeplinkPayload: c.deeplink_payload } : {}),
    ...(c.session?.sdp_type === 'offer' && c.session.sdp ? { sdpOffer: c.session.sdp } : {}),
    ...(c.session?.sdp_type === 'answer' && c.session.sdp ? { sdpAnswer: c.session.sdp } : {}),
  };
}

export async function dispatchWhatsAppCallingWebhook(
  svc: WhatsAppCallingService,
  tenantId: string,
  rawPayload: unknown,
): Promise<void> {
  const payload = (rawPayload ?? {}) as MetaWabaWebhook;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};

      for (const c of v.calls ?? []) {
        if (!c.id) continue;
        if (c.event === 'connect') {
          await svc.onConnect(tenantId, mapConnect(c));
        } else if (c.event === 'terminate') {
          const statusStr = Array.isArray(c.status) ? c.status[0] : c.status;
          const startTime = num(c.start_time);
          const endTime = num(c.end_time);
          await svc.onTerminate(tenantId, {
            waCallId: c.id,
            ...(statusStr ? { status: statusStr } : {}),
            ...(startTime !== undefined ? { startTime } : {}),
            ...(endTime !== undefined ? { endTime } : {}),
            ...(c.duration !== undefined ? { durationSec: c.duration } : {}),
          });
        }
      }

      // Outbound call state transitions arrive as call-type statuses.
      for (const st of v.statuses ?? []) {
        if (st.type === 'call' && st.id && st.status) {
          await svc.onStatus(tenantId, { waCallId: st.id, status: st.status });
        }
      }

      // Permission accept/reject replies arrive as interactive messages.
      for (const m of v.messages ?? []) {
        if (m.interactive?.type === 'call_permission_reply') {
          await svc.onPermissionReply(tenantId, m.context?.id ?? '', m);
        }
      }

      if (change.field === 'account_settings_update') {
        await svc.onAccountEvent(tenantId, 'settings_update', v);
      } else if (change.field === 'account_update') {
        await svc.onAccountEvent(tenantId, 'restriction', v);
      }
    }
  }
}
