import type { WhatsAppCallingTelephony } from '@vocaliq/provider-router';
import { type WaCallBlockReason, whatsappCallSettingsSchema } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { NoopWaCallMeter } from './whatsapp-call-cost.service';
import type { WhatsAppInboundRouting } from './whatsapp-call-routing.service';
import { WhatsAppCallingService } from './whatsapp-calling.service';
import { dispatchWhatsAppCallingWebhook } from './whatsapp-calling.webhooks';
import type { WaAnswerRequest } from './whatsapp-media-control';
import { PendingWaMediaControl } from './whatsapp-media-control';

/**
 * WhatsApp Calling control plane (WAC-02 → WAC-04) against real Postgres + RLS. Uses dedicated sibling
 * tenants so the WhatsAppCall/Event rows can't collide with other suites and isolation is provable.
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff20a001';
const T2 = '00000000-0000-0000-0000-0000ff20a002';
const AGENT = '00000000-0000-0000-0000-0000ff20b001';

/** WAC-04 helpers: a fake router + settings reader + media that records the answer requests it sees. */
const routerTo = (routing: WhatsAppInboundRouting | null) => ({
  resolveInboundAgent: async () => routing,
  resolveAgentById: async () => routing,
});
const openHours = () => Promise.resolve(whatsappCallSettingsSchema.parse({}));
const closedHours = () =>
  Promise.resolve(
    whatsappCallSettingsSchema.parse({ hours: { enabled: true, timezone: 'UTC', weekly: [] } }),
  );
function fakeMedia(answer: string | null) {
  const reqs: WaAnswerRequest[] = [];
  const media = {
    requestSdpAnswer: async (r: WaAnswerRequest) => {
      reqs.push(r);
      return answer;
    },
    requestSdpOffer: async () => null,
    applyAnswer: async () => {},
    endCall: async () => {},
  };
  return { media, reqs };
}
const routing = (over: Partial<WhatsAppInboundRouting> = {}): WhatsAppInboundRouting => ({
  agentId: AGENT,
  agentName: 'WA Agent',
  flowVersionId: null,
  systemPrompt: 'You are A.',
  greeting: 'Hi from A.',
  ...over,
});

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `wac-${id.slice(-4)}`,
        slug: `wac-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T, name: 'WA Agent', status: 'PUBLISHED' },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } }); // cascades WhatsAppCall + events
});

/** A fake adapter that records the signaling calls the service makes. */
function fakeAdapter() {
  const calls = {
    preAccept: [] as string[],
    accept: [] as string[],
    terminate: [] as string[],
    placeCall: [] as string[],
  };
  const adapter = {
    async preAccept({ callId }: { callId: string }) {
      calls.preAccept.push(callId);
    },
    async accept({ callId }: { callId: string }) {
      calls.accept.push(callId);
    },
    async reject() {},
    async terminate(callId: string) {
      calls.terminate.push(callId);
    },
    async placeCall({ to }: { to: string }) {
      calls.placeCall.push(to);
      return { waCallId: `wacid.out.${to}` };
    },
  } as unknown as WhatsAppCallingTelephony;
  return { adapter, calls };
}

/** A media fake that yields a business SDP offer for outbound (and records the answer requests). */
function fakeOutboundMedia(offer: string | null) {
  const applied: Array<{ callId: string; sdp: string }> = [];
  const media = {
    requestSdpAnswer: async () => null,
    requestSdpOffer: async () => offer,
    applyAnswer: async (callId: string, sdp: string) => {
      applied.push({ callId, sdp });
    },
    endCall: async () => {},
  };
  return { media, applied };
}

/** A fake permission gate capturing what the control plane asks of it. */
function fakePermission(canCall: { allowed: boolean; reason?: WaCallBlockReason }) {
  const seen = {
    replies: [] as Array<{ waId: string; response: string }>,
    outcomes: [] as Array<{ waId: string; answered: boolean }>,
  };
  const gate = {
    canCall: async () => ({
      allowed: canCall.allowed,
      ...(canCall.reason ? { reason: canCall.reason } : {}),
      permission: {
        waId: '',
        status: 'permanent' as const,
        expiresAt: null,
        source: 'request',
        consecutiveUnanswered: 0,
        updatedAt: null,
      },
      connectedLast24h: 0,
    }),
    recordPermissionReply: async (_t: string, waId: string, reply: { response: string }) => {
      seen.replies.push({ waId, response: reply.response });
    },
    recordCallOutcome: async (_t: string, waId: string, answered: boolean) => {
      seen.outcomes.push({ waId, answered });
    },
  };
  return { gate, seen };
}

function connectPayload(waCallId: string) {
  return {
    entry: [
      {
        changes: [
          {
            field: 'calls',
            value: {
              calls: [
                {
                  id: waCallId,
                  to: '16315553601',
                  from: '14155551234',
                  from_user_id: 'BSUID1',
                  event: 'connect',
                  direction: 'USER_INITIATED',
                  cta_payload: 'order:A1234',
                  session: { sdp_type: 'offer', sdp: 'v=0 offer' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('WhatsAppCallingService', () => {
  it('records an inbound connect as `connecting` (gated: no media/adapter) and is idempotent by WACID', async () => {
    const svc = new WhatsAppCallingService(db, async () => null, new PendingWaMediaControl());
    await dispatchWhatsAppCallingWebhook(svc, T, connectPayload('wacid.gated'));
    await dispatchWhatsAppCallingWebhook(svc, T, connectPayload('wacid.gated')); // replay

    const rows = await db.admin.whatsAppCall.findMany({
      where: { tenantId: T, waCallId: 'wacid.gated' },
    });
    expect(rows).toHaveLength(1); // idempotent
    expect(rows[0]?.status).toBe('connecting');
    expect(rows[0]?.direction).toBe('USER_INITIATED');
    expect(rows[0]?.ctaPayload).toBe('order:A1234');
    const events = await db.admin.whatsAppCallEvent.count({
      where: { tenantId: T, waCallId: 'wacid.gated' },
    });
    expect(events).toBe(2); // both webhooks audited
  });

  it('pre_accepts + accepts via the adapter when media returns an SDP answer', async () => {
    const { adapter, calls } = fakeAdapter();
    const media = {
      requestSdpAnswer: async () => 'v=0 answer',
      requestSdpOffer: async () => null,
      applyAnswer: async () => {},
      endCall: async () => {},
    };
    const svc = new WhatsAppCallingService(db, async () => adapter, media);
    await svc.onConnect(T, {
      waCallId: 'wacid.live',
      direction: 'USER_INITIATED',
      sdpOffer: 'v=0 offer',
    });

    expect(calls.preAccept).toContain('wacid.live');
    expect(calls.accept).toContain('wacid.live');
    const row = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: 'wacid.live' },
    });
    expect(row?.status).toBe('accepted');
  });

  it('persists terminate status + duration, and status transitions', async () => {
    const svc = new WhatsAppCallingService(db, async () => null, new PendingWaMediaControl());
    await svc.onConnect(T, { waCallId: 'wacid.term', direction: 'USER_INITIATED' });
    await svc.onStatus(T, { waCallId: 'wacid.term', status: 'RINGING' });
    await svc.onTerminate(T, {
      waCallId: 'wacid.term',
      status: 'Completed',
      startTime: 1671644824,
      endTime: 1671644944,
      durationSec: 120,
    });
    const row = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: 'wacid.term' },
    });
    expect(row?.status).toBe('completed');
    expect(row?.durationSec).toBe(120);
    expect(row?.endedAt).toBeTruthy();
  });

  it('is tenant-isolated (a sibling tenant never sees another tenant’s WhatsApp calls) — self-audit B', async () => {
    const svc = new WhatsAppCallingService(db, async () => null, new PendingWaMediaControl());
    await svc.onConnect(T, { waCallId: 'wacid.iso', direction: 'USER_INITIATED' });
    // T2 (a sibling, not an ancestor of T) must see none of T's calls under RLS.
    const seenByT2 = await db.withTenant(T2, (tx) =>
      tx.whatsAppCall.findMany({ where: { waCallId: 'wacid.iso' } }),
    );
    expect(seenByT2).toHaveLength(0);
    const seenByT = await db.withTenant(T, (tx) =>
      tx.whatsAppCall.findMany({ where: { waCallId: 'wacid.iso' } }),
    );
    expect(seenByT).toHaveLength(1);
  });
});

describe('WhatsAppCallingService — WAC-04 inbound GA', () => {
  it('routes → answers → opens a linked unified Call, in context', async () => {
    const { adapter, calls } = fakeAdapter();
    const { media, reqs } = fakeMedia('v=0 answer');
    const svc = new WhatsAppCallingService(
      db,
      async () => adapter,
      media,
      new NoopWaCallMeter(),
      routerTo(routing()),
      openHours,
    );
    await svc.onConnect(T, {
      waCallId: 'wac4.live',
      direction: 'USER_INITIATED',
      to: '16315553601',
      sdpOffer: 'v=0 offer',
      ctaPayload: 'intent=book_demo&ref=A1234',
    });

    expect(calls.accept).toContain('wac4.live');
    const wa = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: 'wac4.live' },
    });
    expect(wa?.status).toBe('accepted');
    const callId = wa?.callId ?? '';
    expect(callId).toBeTruthy();

    const call = await db.admin.call.findFirst({ where: { id: callId } });
    expect(call?.channel).toBe('WHATSAPP');
    expect(call?.direction).toBe('INBOUND');
    expect(call?.status).toBe('IN_PROGRESS');
    expect(call?.agentId).toBe(AGENT);

    // The unified Call id (not the WACID) is what the media bridge keys on; the context brief +
    // persona + greeting all reach the answer request.
    expect(reqs[0]?.callId).toBe(callId);
    expect(reqs[0]?.agentId).toBe(AGENT);
    expect(reqs[0]?.systemPrompt).toContain('You are A.');
    expect(reqs[0]?.systemPrompt).toContain('book_demo');
    expect(reqs[0]?.greeting).toBe('Hi from A.');
  });

  it('rejects a call outside calling hours — no media, no unified Call', async () => {
    const { media, reqs } = fakeMedia('v=0 answer');
    const svc = new WhatsAppCallingService(
      db,
      async () => null,
      media,
      new NoopWaCallMeter(),
      routerTo(routing()),
      closedHours,
    );
    await svc.onConnect(T, {
      waCallId: 'wac4.closed',
      direction: 'USER_INITIATED',
      to: '16315553601',
      sdpOffer: 'v=0 offer',
    });
    expect(reqs).toHaveLength(0); // never asked the voice bridge for media
    const wa = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: 'wac4.closed' },
    });
    expect(wa?.status).toBe('rejected');
    expect(wa?.callId).toBeNull();
    const ev = await db.admin.whatsAppCallEvent.findFirst({
      where: { tenantId: T, waCallId: 'wac4.closed', event: 'rejected' },
    });
    expect((ev?.payload as { reason?: string } | null)?.reason).toBe('outside_calling_hours');
  });

  it('rejects when no publishable agent is available', async () => {
    const { media, reqs } = fakeMedia('v=0 answer');
    const svc = new WhatsAppCallingService(
      db,
      async () => null,
      media,
      new NoopWaCallMeter(),
      routerTo(null),
      openHours,
    );
    await svc.onConnect(T, {
      waCallId: 'wac4.noagent',
      direction: 'USER_INITIATED',
      to: '16315553601',
      sdpOffer: 'v=0 offer',
    });
    expect(reqs).toHaveLength(0);
    const wa = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: 'wac4.noagent' },
    });
    expect(wa?.status).toBe('rejected');
  });

  it('opens then fails the unified Call when media is unavailable (gated)', async () => {
    const { media } = fakeMedia(null);
    const svc = new WhatsAppCallingService(
      db,
      async () => null,
      media,
      new NoopWaCallMeter(),
      routerTo(routing()),
      openHours,
    );
    await svc.onConnect(T, {
      waCallId: 'wac4.gatedmedia',
      direction: 'USER_INITIATED',
      to: '16315553601',
      sdpOffer: 'v=0 offer',
    });
    const wa = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: 'wac4.gatedmedia' },
    });
    expect(wa?.status).toBe('connecting'); // never accepted
    const callId = wa?.callId ?? '';
    expect(callId).toBeTruthy();
    const call = await db.admin.call.findFirst({ where: { id: callId } });
    expect(call?.status).toBe('FAILED');
    expect(call?.disposition).toBe('media_unavailable');
  });

  it('terminate closes the linked unified Call with duration + carrier cost', async () => {
    const { adapter } = fakeAdapter();
    const { media } = fakeMedia('v=0 answer');
    const svc = new WhatsAppCallingService(
      db,
      async () => adapter,
      media,
      new NoopWaCallMeter(),
      routerTo(routing()),
      openHours,
    );
    await svc.onConnect(T, {
      waCallId: 'wac4.term',
      direction: 'USER_INITIATED',
      to: '16315553601',
      sdpOffer: 'v=0 offer',
    });
    // Stand in for WAC-06 having metered a carrier cost onto the WhatsApp call row.
    await db.admin.whatsAppCall.update({
      where: { tenantId_waCallId: { tenantId: T, waCallId: 'wac4.term' } },
      data: { costUsd: 0.03 },
    });
    await svc.onTerminate(T, { waCallId: 'wac4.term', status: 'Completed', durationSec: 42 });

    const wa = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: 'wac4.term' },
    });
    const call = await db.admin.call.findFirst({ where: { id: wa?.callId ?? '' } });
    expect(call?.status).toBe('COMPLETED');
    expect(call?.durationSec).toBe(42);
    expect((call?.costBreakdown as { telephony?: number } | null)?.telephony).toBeCloseTo(0.03, 6);
  });
});

describe('WhatsAppCallingService — WAC-08 consented outbound', () => {
  it('refuses to dial when the permission gate blocks (compliance)', async () => {
    const { adapter, calls } = fakeAdapter();
    const { media } = fakeOutboundMedia('v=0 offer');
    const { gate } = fakePermission({ allowed: false, reason: 'no_permission' });
    const svc = new WhatsAppCallingService(
      db,
      async () => adapter,
      media,
      new NoopWaCallMeter(),
      routerTo(routing()),
      null,
      gate,
    );
    await expect(svc.placeOutboundCall(T, { to: '15551112222', agentId: AGENT })).rejects.toThrow(
      /permission/i,
    );
    expect(calls.placeCall).toHaveLength(0); // never dialed
  });

  it('places a consented outbound call and opens a linked OUTBOUND Call', async () => {
    const { adapter, calls } = fakeAdapter();
    const { media } = fakeOutboundMedia('v=0 offer');
    const { gate } = fakePermission({ allowed: true });
    const svc = new WhatsAppCallingService(
      db,
      async () => adapter,
      media,
      new NoopWaCallMeter(),
      routerTo(routing()),
      null,
      gate,
    );
    const res = await svc.placeOutboundCall(T, { to: '15551112222', agentId: AGENT });
    expect(calls.placeCall).toContain('15551112222');
    expect(res.waCallId).toBe('wacid.out.15551112222');

    const wa = await db.admin.whatsAppCall.findFirst({
      where: { tenantId: T, waCallId: res.waCallId },
    });
    expect(wa?.direction).toBe('BUSINESS_INITIATED');
    expect(wa?.toNumber).toBe('15551112222');
    expect(wa?.callId).toBe(res.callId);

    const call = await db.admin.call.findFirst({ where: { id: res.callId } });
    expect(call?.direction).toBe('OUTBOUND');
    expect(call?.channel).toBe('WHATSAPP');
    expect(call?.agentId).toBe(AGENT);
  });

  it('throws + fails the unified Call when outbound media is gated', async () => {
    const { adapter, calls } = fakeAdapter();
    const { media } = fakeOutboundMedia(null); // no business offer
    const { gate } = fakePermission({ allowed: true });
    const svc = new WhatsAppCallingService(
      db,
      async () => adapter,
      media,
      new NoopWaCallMeter(),
      routerTo(routing()),
      null,
      gate,
    );
    await expect(svc.placeOutboundCall(T, { to: '15553334444', agentId: AGENT })).rejects.toThrow(
      /not configured/i,
    );
    expect(calls.placeCall).toHaveLength(0);
    const failed = await db.admin.call.findFirst({
      where: {
        tenantId: T,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        disposition: 'media_unavailable',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(failed?.status).toBe('FAILED');
  });

  it('persists a permission reply + feeds the terminate outcome to the back-off engine', async () => {
    const { adapter } = fakeAdapter();
    const { media } = fakeOutboundMedia('v=0 offer');
    const { gate, seen } = fakePermission({ allowed: true });
    const svc = new WhatsAppCallingService(
      db,
      async () => adapter,
      media,
      new NoopWaCallMeter(),
      routerTo(routing()),
      null,
      gate,
    );
    await svc.onPermissionReply(T, '15551119999', { response: 'accept', isPermanent: true }, {});
    expect(seen.replies).toContainEqual({ waId: '15551119999', response: 'accept' });

    const res = await svc.placeOutboundCall(T, { to: '15556667777', agentId: AGENT });
    await svc.onTerminate(T, { waCallId: res.waCallId, status: 'Completed', durationSec: 30 });
    expect(seen.outcomes).toContainEqual({ waId: '15556667777', answered: true });
  });
});
