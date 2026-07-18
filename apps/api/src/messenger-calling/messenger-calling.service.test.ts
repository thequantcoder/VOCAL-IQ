import type { MessengerCallingTelephony } from '@vocaliq/provider-router';
import { toMessengerCallRef } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessengerCallingService, type MessengerInboundRouting } from './messenger-calling.service';
import { dispatchMessengerCallingWebhook } from './messenger-calling.webhooks';
import type { MeAnswerRequest } from './messenger-media-control';
import { PendingMeMediaControl } from './messenger-media-control';

/**
 * Messenger Calling control plane (MEC-02) against real Postgres + RLS. Dedicated sibling tenants so the
 * MessengerCall/Event rows can't collide with other suites and isolation is provable.
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff30a001';
const T2 = '00000000-0000-0000-0000-0000ff30a002';
const AGENT = '00000000-0000-0000-0000-0000ff30b001';

const routerTo = (routing: MessengerInboundRouting | null) => ({
  resolveInboundAgent: async () => routing,
});
const routing = (over: Partial<MessengerInboundRouting> = {}): MessengerInboundRouting => ({
  agentId: AGENT,
  systemPrompt: 'You are A.',
  greeting: 'Hi from A.',
  ...over,
});

function fakeMedia(answer: string | null) {
  const reqs: MeAnswerRequest[] = [];
  const media = {
    requestSdpAnswer: async (r: MeAnswerRequest) => {
      reqs.push(r);
      return answer;
    },
    requestSdpOffer: async () => null,
    applyAnswer: async () => {},
    endCall: async () => {},
  };
  return { media, reqs };
}

/** A fake adapter that records the signaling calls the service makes. */
function fakeAdapter() {
  const calls = { preAccept: [] as string[], accept: [] as string[], reject: [] as string[] };
  const adapter = {
    async preAccept({ callId }: { callId: string }) {
      calls.preAccept.push(callId);
    },
    async accept({ callId }: { callId: string }) {
      calls.accept.push(callId);
    },
    async reject(callId: string) {
      calls.reject.push(callId);
    },
    async terminate() {},
  } as unknown as MessengerCallingTelephony;
  return { adapter, calls };
}

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `mec-${id.slice(-4)}`,
        slug: `mec-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T, name: 'ME Agent', status: 'PUBLISHED' },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } }); // cascades MessengerCall + events
});

/** A Messenger-style webhook (call event on a `messaging` event) — exercises the dispatcher shape. */
function connectPayload(meCallId: string, ref?: string) {
  return {
    entry: [
      {
        id: 'PAGE123',
        messaging: [
          {
            sender: { id: 'PSID999' },
            recipient: { id: 'PAGE123' },
            call: {
              id: meCallId,
              event: 'connect',
              direction: 'USER_INITIATED',
              ...(ref ? { ref } : {}),
              session: { sdp_type: 'offer', sdp: 'v=0 offer' },
            },
          },
        ],
      },
    ],
  };
}

describe('MessengerCallingService (MEC-02)', () => {
  it('records an inbound connect as `connecting` (gated) and is idempotent by call id', async () => {
    const svc = new MessengerCallingService(db, async () => null, new PendingMeMediaControl());
    const ref = toMessengerCallRef({ intent: 'book_demo', reference: 'A1234' });
    await dispatchMessengerCallingWebhook(svc, T, connectPayload('mecid.gated', ref));
    await dispatchMessengerCallingWebhook(svc, T, connectPayload('mecid.gated', ref)); // replay

    const rows = await db.admin.messengerCall.findMany({
      where: { tenantId: T, meCallId: 'mecid.gated' },
    });
    expect(rows).toHaveLength(1); // idempotent
    expect(rows[0]?.status).toBe('connecting');
    expect(rows[0]?.direction).toBe('USER_INITIATED');
    expect(rows[0]?.psid).toBe('PSID999');
    expect(rows[0]?.pageId).toBe('PAGE123');
    expect(rows[0]?.refPayload).toBe(ref);
    const events = await db.admin.messengerCallEvent.count({
      where: { tenantId: T, meCallId: 'mecid.gated' },
    });
    expect(events).toBe(2);
  });

  it('pre_accepts + accepts via the adapter when media returns an SDP answer', async () => {
    const { adapter, calls } = fakeAdapter();
    const { media } = fakeMedia('v=0 answer');
    const svc = new MessengerCallingService(db, async () => adapter, media);
    await svc.onConnect(T, {
      meCallId: 'mecid.live',
      direction: 'USER_INITIATED',
      sdpOffer: 'v=0 offer',
    });
    expect(calls.preAccept).toContain('mecid.live');
    expect(calls.accept).toContain('mecid.live');
    const row = await db.admin.messengerCall.findFirst({
      where: { tenantId: T, meCallId: 'mecid.live' },
    });
    expect(row?.status).toBe('accepted');
  });

  it('persists terminate status + duration', async () => {
    const svc = new MessengerCallingService(db, async () => null, new PendingMeMediaControl());
    await svc.onConnect(T, { meCallId: 'mecid.term', direction: 'USER_INITIATED' });
    await svc.onTerminate(T, {
      meCallId: 'mecid.term',
      status: 'Completed',
      startTime: 1671644824,
      endTime: 1671644944,
      durationSec: 120,
    });
    const row = await db.admin.messengerCall.findFirst({
      where: { tenantId: T, meCallId: 'mecid.term' },
    });
    expect(row?.status).toBe('completed');
    expect(row?.durationSec).toBe(120);
    expect(row?.endedAt).toBeTruthy();
  });

  it('is tenant-isolated (a sibling tenant never sees another tenant’s Messenger calls) — self-audit B', async () => {
    const svc = new MessengerCallingService(db, async () => null, new PendingMeMediaControl());
    await svc.onConnect(T, { meCallId: 'mecid.iso', direction: 'USER_INITIATED' });
    const seenByT2 = await db.withTenant(T2, (tx) =>
      tx.messengerCall.findMany({ where: { meCallId: 'mecid.iso' } }),
    );
    expect(seenByT2).toHaveLength(0);
    const seenByT = await db.withTenant(T, (tx) =>
      tx.messengerCall.findMany({ where: { meCallId: 'mecid.iso' } }),
    );
    expect(seenByT).toHaveLength(1);
  });

  it('routes → answers → opens a linked unified Call(channel=MESSENGER), in context', async () => {
    const { adapter, calls } = fakeAdapter();
    const { media, reqs } = fakeMedia('v=0 answer');
    const svc = new MessengerCallingService(
      db,
      async () => adapter,
      media,
      undefined,
      routerTo(routing()),
    );
    const ref = toMessengerCallRef({ intent: 'book_demo', reference: 'A1234' });
    await svc.onConnect(T, {
      meCallId: 'mec.routed',
      direction: 'USER_INITIATED',
      pageId: 'PAGE123',
      sdpOffer: 'v=0 offer',
      refPayload: ref,
    });

    expect(calls.accept).toContain('mec.routed');
    const me = await db.admin.messengerCall.findFirst({
      where: { tenantId: T, meCallId: 'mec.routed' },
    });
    expect(me?.status).toBe('accepted');
    const callId = me?.callId ?? '';
    expect(callId).toBeTruthy();
    const call = await db.admin.call.findFirst({ where: { id: callId } });
    expect(call?.channel).toBe('MESSENGER');
    expect(call?.direction).toBe('INBOUND');
    expect(call?.status).toBe('IN_PROGRESS');
    expect(call?.agentId).toBe(AGENT);
    // The unified Call id (not the Meta call id) is what the media bridge keys on; the context brief +
    // persona + greeting all reach the answer request.
    expect(reqs[0]?.callId).toBe(callId);
    expect(reqs[0]?.systemPrompt).toContain('You are A.');
    expect(reqs[0]?.systemPrompt).toContain('book_demo');
    expect(reqs[0]?.greeting).toBe('Hi from A.');
  });

  it('rejects when no publishable agent is available', async () => {
    const { media, reqs } = fakeMedia('v=0 answer');
    const svc = new MessengerCallingService(db, async () => null, media, undefined, routerTo(null));
    await svc.onConnect(T, {
      meCallId: 'mec.noagent',
      direction: 'USER_INITIATED',
      pageId: 'PAGE123',
      sdpOffer: 'v=0 offer',
    });
    expect(reqs).toHaveLength(0);
    const me = await db.admin.messengerCall.findFirst({
      where: { tenantId: T, meCallId: 'mec.noagent' },
    });
    expect(me?.status).toBe('rejected');
  });

  it('opens then fails the unified Call when media is unavailable (gated)', async () => {
    const { media } = fakeMedia(null);
    const svc = new MessengerCallingService(
      db,
      async () => null,
      media,
      undefined,
      routerTo(routing()),
    );
    await svc.onConnect(T, {
      meCallId: 'mec.gatedmedia',
      direction: 'USER_INITIATED',
      pageId: 'PAGE123',
      sdpOffer: 'v=0 offer',
    });
    const me = await db.admin.messengerCall.findFirst({
      where: { tenantId: T, meCallId: 'mec.gatedmedia' },
    });
    expect(me?.status).toBe('connecting');
    const call = await db.admin.call.findFirst({ where: { id: me?.callId ?? '' } });
    expect(call?.status).toBe('FAILED');
    expect(call?.disposition).toBe('media_unavailable');
  });

  it('terminate closes the linked unified Call with duration + carrier cost', async () => {
    const { adapter } = fakeAdapter();
    const { media } = fakeMedia('v=0 answer');
    const svc = new MessengerCallingService(
      db,
      async () => adapter,
      media,
      undefined,
      routerTo(routing()),
    );
    await svc.onConnect(T, {
      meCallId: 'mec.close',
      direction: 'USER_INITIATED',
      pageId: 'PAGE123',
      sdpOffer: 'v=0 offer',
    });
    // Stand in for MEC-06 having metered a carrier cost onto the Messenger call row.
    await db.admin.messengerCall.update({
      where: { tenantId_meCallId: { tenantId: T, meCallId: 'mec.close' } },
      data: { costUsd: 0.01 },
    });
    await svc.onTerminate(T, { meCallId: 'mec.close', status: 'Completed', durationSec: 42 });
    const me = await db.admin.messengerCall.findFirst({
      where: { tenantId: T, meCallId: 'mec.close' },
    });
    const call = await db.admin.call.findFirst({ where: { id: me?.callId ?? '' } });
    expect(call?.status).toBe('COMPLETED');
    expect(call?.durationSec).toBe(42);
    expect((call?.costBreakdown as { telephony?: number } | null)?.telephony).toBeCloseTo(0.01, 6);
  });
});
