import type { WhatsAppCallingTelephony } from '@vocaliq/provider-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { WhatsAppCallingService } from './whatsapp-calling.service';
import { dispatchWhatsAppCallingWebhook } from './whatsapp-calling.webhooks';
import { PendingWaMediaControl } from './whatsapp-media-control';

/**
 * WhatsApp Calling control plane (WAC-02) against real Postgres + RLS. Uses dedicated sibling tenants
 * so the WhatsAppCall/Event rows can't collide with other suites and isolation is provable.
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff20a001';
const T2 = '00000000-0000-0000-0000-0000ff20a002';

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
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } }); // cascades WhatsAppCall + events
});

/** A fake adapter that records the signaling calls the service makes. */
function fakeAdapter() {
  const calls = { preAccept: [] as string[], accept: [] as string[], terminate: [] as string[] };
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
  } as unknown as WhatsAppCallingTelephony;
  return { adapter, calls };
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
    const media = { requestSdpAnswer: async () => 'v=0 answer', endCall: async () => {} };
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
