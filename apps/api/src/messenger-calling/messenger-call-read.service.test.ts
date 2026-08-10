import { toMessengerCallRef } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { MessengerCallReadService } from './messenger-call-read.service';

/**
 * MEC-04 dashboard read model against real Postgres + RLS. Seeds Messenger call rows + a linked unified
 * Call and asserts the overview KPIs + the live-call view (identity, decoded `ref` context, agent).
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff32a001';
const AGENT = '00000000-0000-0000-0000-0000ff32b001';

const read = new MessengerCallReadService(db);

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: {
      id: T,
      type: 'CUSTOMER',
      name: 'mec4-read',
      slug: `mec4-read-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T, name: 'Read Agent', status: 'PUBLISHED' },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

describe('MessengerCallReadService — overview (MEC-04)', () => {
  it('reports today KPIs, this-month minutes (tier0 free), and recent calls', async () => {
    await db.admin.messengerCall.createMany({
      data: [
        {
          tenantId: T,
          meCallId: 'mec.read.done',
          direction: 'USER_INITIATED',
          status: 'completed',
          psid: 'PSID1',
          durationSec: 120,
          costUsd: 0,
        },
        {
          tenantId: T,
          meCallId: 'mec.read.ring',
          direction: 'USER_INITIATED',
          status: 'connecting',
          psid: 'PSID2',
        },
      ],
    });

    const ov = await read.overview(T);
    expect(ov.stats.callsToday).toBeGreaterThanOrEqual(2);
    expect(ov.stats.answeredToday).toBeGreaterThanOrEqual(1);
    expect(ov.monthly.tier).toBe('tier0'); // Messenger calling is free-tier
    expect(ov.monthly.minutes).toBeGreaterThanOrEqual(2); // 120 s ⇒ 2.0 min
    expect(ov.recent.length).toBeGreaterThanOrEqual(2);
    expect(ov.recent[0]?.meCallId).toBeTruthy();
  });
});

describe('MessengerCallReadService — liveCall (MEC-04)', () => {
  it('returns identity + decoded ref context + linked agent + status timeline', async () => {
    const ref = toMessengerCallRef({ intent: 'support', reference: 'ORD-9' });
    const call = await db.admin.call.create({
      data: {
        tenantId: T,
        agentId: AGENT,
        direction: 'INBOUND',
        channel: 'MESSENGER',
        status: 'IN_PROGRESS',
      },
      select: { id: true },
    });
    await db.admin.messengerCall.create({
      data: {
        tenantId: T,
        meCallId: 'mec.read.live',
        direction: 'USER_INITIATED',
        status: 'accepted',
        psid: 'PSID9',
        pageId: 'PAGE9',
        refPayload: ref,
        callId: call.id,
      },
    });
    await db.admin.messengerCallEvent.create({
      data: { tenantId: T, meCallId: 'mec.read.live', event: 'connect', payload: {} },
    });

    const live = await read.liveCall(T, 'mec.read.live');
    expect(live.psid).toBe('PSID9');
    expect(live.pageId).toBe('PAGE9');
    expect(live.context).toEqual({ intent: 'support', reference: 'ORD-9' });
    expect(live.callId).toBe(call.id);
    expect(live.agent).toEqual({ id: AGENT, name: 'Read Agent' });
    expect(live.events.map((e) => e.event)).toContain('connect');
  });

  it('throws NotFound for an unknown call', async () => {
    await expect(read.liveCall(T, 'nope')).rejects.toThrow(/not found/i);
  });
});
