import type { MeConnectInput, MessengerCallingService } from './messenger-calling.service';

/**
 * Parse the calling-relevant parts of a (already HMAC-verified) Meta Messenger webhook and dispatch them
 * to the {@link MessengerCallingService} (MEC-02) — the WhatsApp `dispatchWhatsAppCallingWebhook` sibling.
 * Best-effort + idempotent by Meta call id. Messenger events arrive under `entry[].messaging[]`; text/
 * message handling stays in the messaging handler and this only touches call events. The `tenantId` comes
 * from the webhook URL (the messaging seam), so no cross-tenant lookup is needed.
 *
 * ⚠️ WIRE FORMAT `[CONFIRM @ MEC-00]` (CLAUDE.md §15): Meta's Messenger call webhook field name/shape is
 * not fully public. This reads the most likely shapes — a `call` object on a `messaging` event (Messenger-
 * style) and a WhatsApp-style `changes[].value.calls[]` fallback — tolerantly, and is the ONE place that
 * changes once MEC-00 confirms the real payload. Nothing here dials; it only records + hands off.
 */

interface MeCallEvent {
  id?: string; // Meta Messenger call id
  event?: string; // connect | terminate
  direction?: string; // USER_INITIATED | BUSINESS_INITIATED
  session?: { sdp_type?: string; sdp?: string };
  status?: string | string[]; // Completed | Failed (terminate)
  ref?: string; // m.me / call-button context ref
  start_time?: string | number;
  end_time?: string | number;
  duration?: number;
  error?: { code?: number };
}
interface MeCallStatus {
  id?: string;
  status?: string; // RINGING | ACCEPTED | REJECTED (outbound, MEC-08)
}
interface MessengerMessagingEvent {
  sender?: { id?: string }; // PSID (inbound) — the Messenger user
  recipient?: { id?: string }; // Page id
  call?: MeCallEvent;
  call_status?: MeCallStatus;
}
interface MetaMessengerWebhook {
  entry?: Array<{
    id?: string; // the Page id
    messaging?: MessengerMessagingEvent[];
    changes?: Array<{
      field?: string;
      value?: { calls?: MeCallEvent[]; call_status?: MeCallStatus[] };
    }>;
  }>;
}

const num = (v: string | number | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
};

function mapConnect(c: MeCallEvent, psid?: string, pageId?: string): MeConnectInput {
  const isBusiness = c.direction === 'BUSINESS_INITIATED';
  return {
    meCallId: c.id ?? '',
    direction: isBusiness ? 'BUSINESS_INITIATED' : 'USER_INITIATED',
    ...(psid ? { psid } : {}),
    ...(pageId ? { pageId } : {}),
    ...(c.ref ? { refPayload: c.ref } : {}),
    ...(c.session?.sdp_type === 'offer' && c.session.sdp ? { sdpOffer: c.session.sdp } : {}),
    ...(c.session?.sdp_type === 'answer' && c.session.sdp ? { sdpAnswer: c.session.sdp } : {}),
  };
}

async function dispatchCall(
  svc: MessengerCallingService,
  tenantId: string,
  c: MeCallEvent,
  psid?: string,
  pageId?: string,
): Promise<void> {
  if (!c.id) return;
  if (c.event === 'connect') {
    await svc.onConnect(tenantId, mapConnect(c, psid, pageId));
  } else if (c.event === 'terminate') {
    const statusStr = Array.isArray(c.status) ? c.status[0] : c.status;
    const startTime = num(c.start_time);
    const endTime = num(c.end_time);
    await svc.onTerminate(tenantId, {
      meCallId: c.id,
      ...(statusStr ? { status: statusStr } : {}),
      ...(startTime !== undefined ? { startTime } : {}),
      ...(endTime !== undefined ? { endTime } : {}),
      ...(c.duration !== undefined ? { durationSec: c.duration } : {}),
      ...(c.error?.code !== undefined ? { errorCode: c.error.code } : {}),
    });
  }
}

export async function dispatchMessengerCallingWebhook(
  svc: MessengerCallingService,
  tenantId: string,
  rawPayload: unknown,
): Promise<void> {
  const payload = (rawPayload ?? {}) as MetaMessengerWebhook;
  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;

    // Messenger-style: call events on `messaging` events.
    for (const ev of entry.messaging ?? []) {
      const psid = ev.sender?.id;
      const evPageId = ev.recipient?.id ?? pageId;
      if (ev.call) await dispatchCall(svc, tenantId, ev.call, psid, evPageId);
      if (ev.call_status?.id && ev.call_status.status) {
        await svc.onStatus(tenantId, {
          meCallId: ev.call_status.id,
          status: ev.call_status.status,
        });
      }
    }

    // WhatsApp-style fallback: call events under `changes[].value.calls[]` + settings.
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      for (const c of v.calls ?? []) await dispatchCall(svc, tenantId, c, undefined, pageId);
      for (const st of v.call_status ?? []) {
        if (st.id && st.status)
          await svc.onStatus(tenantId, { meCallId: st.id, status: st.status });
      }
      if (change.field === 'call_settings' || change.field === 'account_settings_update') {
        await svc.onAccountEvent(tenantId, 'settings_update', v);
      }
    }
  }
}
