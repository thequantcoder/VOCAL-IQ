import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import type { WaPermissionGate } from './whatsapp-permission.service';
import { WhatsAppRoutingService } from './whatsapp-routing.service';

/**
 * WhatsApp least-cost routing + guardrails (WAC-09) against real Postgres + RLS. A fake permission gate
 * isolates the routing decision; pickup + restriction come from real rows/settings.
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff29a001';
const DEST = '447700900123';

/** A permission gate whose verdict we control per test. */
function gate(allowed: boolean, reason?: 'no_permission' | 'blocked_country'): WaPermissionGate {
  return {
    canCall: async () => ({
      allowed,
      ...(reason ? { reason } : {}),
      permission: {
        waId: DEST,
        status: allowed ? ('permanent' as const) : ('no_permission' as const),
        expiresAt: null,
        source: 'request',
        consecutiveUnanswered: 0,
        updatedAt: null,
      },
      connectedLast24h: 0,
    }),
    recordPermissionReply: async () => {},
    recordCallOutcome: async () => {},
  };
}

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: {
      id: T,
      type: 'CUSTOMER',
      name: 'wac9',
      slug: `wac9-${Date.now()}`,
      parentTenantId: PLATFORM,
      settings: { whatsappCalling: { enabled: true } },
    },
    update: { settings: { whatsappCalling: { enabled: true } } },
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

describe('WhatsAppRoutingService.planRoute', () => {
  it('routes WhatsApp when enabled + permitted', async () => {
    const svc = new WhatsAppRoutingService(db, gate(true));
    const plan = await svc.planRoute(T, { destination: DEST });
    expect(plan.channel).toBe('whatsapp');
    expect(plan.reason).toBe('permitted');
  });

  it('falls back to PSTN with the gate reason when not permitted', async () => {
    const svc = new WhatsAppRoutingService(db, gate(false, 'no_permission'));
    const plan = await svc.planRoute(T, { destination: DEST });
    expect(plan.channel).toBe('pstn');
    expect(plan.reason).toBe('no_permission');
  });

  it('honors a pstn_preferred policy', async () => {
    const svc = new WhatsAppRoutingService(db, gate(true));
    await svc.setPolicy(T, 'pstn_preferred');
    expect((await svc.planRoute(T, { destination: DEST })).reason).toBe('policy_pstn_preferred');
    await svc.setPolicy(T, 'whatsapp_if_permitted'); // reset
  });
});

describe('WhatsAppRoutingService restriction + health', () => {
  it('persists a restriction and routes around it', async () => {
    const svc = new WhatsAppRoutingService(db, gate(true));
    await svc.applyRestriction(T, {
      restriction: { type: 'RESTRICTED_BIZ_INITIATED_CALLING', direction: 'business_initiated' },
    });
    const health = await svc.health(T);
    expect(health.restriction.active).toBe(true);
    expect(health.restriction.type).toBe('RESTRICTED_BIZ_INITIATED_CALLING');

    const plan = await svc.planRoute(T, { destination: DEST });
    expect(plan.channel).toBe('pstn');
    expect(plan.reason).toBe('whatsapp_restricted');

    // A benign account_update with no restriction clears it.
    await svc.applyRestriction(T, { event: 'settings_update' });
    expect((await svc.health(T)).restriction.active).toBe(false);
  });

  it('throttles WhatsApp when the rolling pickup rate is too low', async () => {
    // 20 outbound attempts, only 2 answered → 10% pickup → throttle.
    await db.admin.whatsAppCall.deleteMany({ where: { tenantId: T } });
    await db.admin.whatsAppCall.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        tenantId: T,
        waCallId: `wac9.pick.${i}`,
        direction: 'BUSINESS_INITIATED',
        status: i < 2 ? 'completed' : 'failed',
      })),
    });
    const svc = new WhatsAppRoutingService(db, gate(true));
    const health = await svc.health(T);
    expect(health.pickup.attempts).toBe(20);
    expect(health.pickup.answered).toBe(2);
    expect(health.pickup.throttled).toBe(true);

    const plan = await svc.planRoute(T, { destination: DEST });
    expect(plan.reason).toBe('throttled_low_pickup');
  });

  it('is tenant-isolated (another tenant sees no restriction/pickup)', async () => {
    const T2 = '00000000-0000-0000-0000-0000ff29a002';
    await db.admin.tenant.upsert({
      where: { id: T2 },
      create: {
        id: T2,
        type: 'CUSTOMER',
        name: 'wac9b',
        slug: `wac9b-${Date.now()}`,
        parentTenantId: PLATFORM,
      },
      update: {},
    });
    const svc = new WhatsAppRoutingService(db, gate(true));
    const health = await svc.health(T2);
    expect(health.pickup.attempts).toBe(0);
    expect(health.restriction.active).toBe(false);
    await db.admin.tenant.deleteMany({ where: { id: T2 } });
  });
});
