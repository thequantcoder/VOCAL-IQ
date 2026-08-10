import { createHmac } from 'node:crypto';
import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { UsageReporterService } from './usage-reporter.service';
import { BillingWebhookService, InMemoryProcessedEvents } from './webhook.service';

/**
 * Billing services against real Postgres, on a DEDICATED tenant so the plan-limit gate +
 * usage sums are isolated from other (parallel) suites. Plans are the seeded ladder
 * (Free: 1 agent / 30 min; Pro: 10 / 1000).
 */

const db = new PrismaService();
const entitlements = new EntitlementsService(db);
const usage = new UsageReporterService(db, entitlements);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const PLAN_PRO = '00000000-0000-0000-0000-000000000011';
const BT = '00000000-0000-0000-0000-0000004b0001';
const AGENT = '00000000-0000-0000-0000-0000004b0002';
const SUB = '00000000-0000-0000-0000-0000004b0003';
const SUB_EXT = 'sub_ext_billing_test';
const T0 = new Date('2022-05-10T09:00:00Z');

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: BT },
    create: {
      id: BT,
      type: 'CUSTOMER',
      parentTenantId: PLATFORM,
      name: 'Billing T',
      slug: 'billing-t',
      status: 'ACTIVE',
    },
    update: {},
  });
});

afterAll(async () => {
  const a = db.admin;
  await a.usageRecord.deleteMany({ where: { tenantId: BT } });
  await a.subscription.deleteMany({ where: { tenantId: BT } });
  await a.agent.deleteMany({ where: { tenantId: BT } });
  await a.tenant.deleteMany({ where: { id: BT } });
});

describe('EntitlementsService', () => {
  it('defaults a tenant with no subscription to the Free plan', async () => {
    const ent = await entitlements.entitlements(BT);
    expect(ent.planName).toBe('Free');
    expect(ent.agentLimit).toBe(1);
    expect(ent.includedMinutes).toBe(30);
  });

  it('enforces the plan agent limit', async () => {
    await entitlements.assertCanCreateAgent(BT); // 0 agents, Free limit 1 → ok
    await db.admin.agent.create({ data: { id: AGENT, tenantId: BT, name: 'A1' } });
    await expect(entitlements.assertCanCreateAgent(BT)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'BILLING',
    );
  });

  it('resolves the subscribed plan (Pro raises the limit)', async () => {
    await db.admin.subscription.upsert({
      where: { id: SUB },
      create: { id: SUB, tenantId: BT, planId: PLAN_PRO, status: 'ACTIVE', externalId: SUB_EXT },
      update: { status: 'ACTIVE', planId: PLAN_PRO },
    });
    const ent = await entitlements.entitlements(BT);
    expect(ent.planName).toBe('Pro');
    expect(ent.agentLimit).toBe(10);
    await entitlements.assertCanCreateAgent(BT); // 1 agent < 10 → ok
  });
});

describe('UsageReporterService', () => {
  it('sums billable telephony minutes and charges overage beyond included', async () => {
    // Remove the Pro sub → back to Free (30 included, 25c/min overage).
    await db.admin.subscription.deleteMany({ where: { id: SUB } });
    const a = db.admin;
    // 2400 billable seconds = 40 min; a BYOK 600s must be excluded.
    await a.usageRecord.create({
      data: {
        tenantId: BT,
        provider: 'TWILIO',
        capability: 'telephony',
        units: 2400,
        costUsd: 0.5,
        byok: false,
        ts: T0,
      },
    });
    await a.usageRecord.create({
      data: {
        tenantId: BT,
        provider: 'TWILIO',
        capability: 'telephony',
        units: 600,
        costUsd: 0.1,
        byok: true,
        ts: T0,
      },
    });

    const report = await usage.report(BT, new Date('2022-05-01'), new Date('2022-06-01'));
    expect(report.usedMinutes).toBe(40);
    expect(report.includedMinutes).toBe(30);
    expect(report.overageMinutes).toBe(10);
    expect(report.overageCents).toBe(250); // 10 min * 25c
  });
});

describe('BillingWebhookService', () => {
  const secret = 'whsec_test';
  const service = new BillingWebhookService(db, new InMemoryProcessedEvents());

  // Sign with the current time so handle()'s real-time replay tolerance accepts it.
  function signed(body: string, t = Math.floor(Date.now() / 1000)): string {
    const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    return `t=${t},v1=${v1}`;
  }

  it('verifies, applies the status transition, and is idempotent', async () => {
    await db.admin.subscription.upsert({
      where: { id: SUB },
      create: { id: SUB, tenantId: BT, planId: PLAN_PRO, status: 'ACTIVE', externalId: SUB_EXT },
      update: { status: 'ACTIVE', externalId: SUB_EXT },
    });
    const body = JSON.stringify({
      id: 'evt_dun_1',
      type: 'invoice.payment_failed',
      data: { object: { subscription: SUB_EXT } },
    });

    const first = await service.handle(body, signed(body), secret);
    expect(first.status).toBe('PAST_DUE');
    const sub = await db.admin.subscription.findUnique({ where: { id: SUB } });
    expect(sub?.status).toBe('PAST_DUE');

    // Re-delivery of the same event id is a no-op.
    const second = await service.handle(body, signed(body), secret);
    expect(second.status).toBe('duplicate');
  });

  it('rejects an invalid signature', async () => {
    const body = JSON.stringify({ id: 'evt_x', type: 'invoice.paid' });
    await expect(service.handle(body, 't=1,v1=deadbeef', secret)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('links a fresh Stripe subscription to the tenant on checkout.session.completed', async () => {
    // Clean slate: this is the FIRST paid checkout — the tenant has no linked subscription yet.
    await db.admin.subscription.deleteMany({ where: { tenantId: BT } });
    const body = JSON.stringify({
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: BT,
          subscription: 'sub_from_checkout',
          metadata: { tenantId: BT, planId: PLAN_PRO },
        },
      },
    });

    const res = await service.handle(body, signed(body), secret);
    expect(res.status).toBe('linked');

    const sub = await db.admin.subscription.findFirst({ where: { tenantId: BT } });
    expect(sub?.externalId).toBe('sub_from_checkout');
    expect(sub?.status).toBe('ACTIVE');
    expect(sub?.planId).toBe(PLAN_PRO);
    expect(sub?.processor).toBe('stripe');
  });
});
