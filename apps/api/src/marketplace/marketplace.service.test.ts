import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AgentsService } from '../agents/agents.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';
import { FlowsService } from '../flows/flows.service';
import { WalletService } from '../wallet/wallet.service';
import { MarketplaceService } from './marketplace.service';

/**
 * Agent-template marketplace (Day 83) — real Postgres, RLS-scoped. Proves publish→review→purchase,
 * the rev-share money flow + clone-into-buyer isolation, no-double-purchase, ratings, payouts, and
 * cross-tenant browse safety.
 */

const db = new PrismaService();
const entitlements = new EntitlementsService(db);
const agents = new AgentsService(db, entitlements);
const flows = new FlowsService(db);
const wallet = new WalletService(db);
const svc = new MarketplaceService(db, wallet, agents, flows);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const PLAN_SCALE = '00000000-0000-0000-0000-000000000012';
const CREATOR = '00000000-0000-0000-0000-0000083a0001';
const BUYER = '00000000-0000-0000-0000-0000083a0002';
const BUYER2 = '00000000-0000-0000-0000-0000083a0003';
const SRC_AGENT = '00000000-0000-0000-0000-0000083a00a1';
const SUB_C = '00000000-0000-0000-0000-0000083a0501';
const SUB_B = '00000000-0000-0000-0000-0000083a0502';
const SUB_B2 = '00000000-0000-0000-0000-0000083a0503';

beforeAll(async () => {
  for (const id of [CREATOR, BUYER, BUYER2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Mkt ${id.slice(-4)}`,
        slug: `mkt-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  // Scale subs so the clone (agent create) has agent-limit headroom in both tenants.
  await db.admin.subscription.upsert({
    where: { id: SUB_C },
    create: { id: SUB_C, tenantId: CREATOR, planId: PLAN_SCALE, status: 'ACTIVE' },
    update: { status: 'ACTIVE', planId: PLAN_SCALE },
  });
  await db.admin.subscription.upsert({
    where: { id: SUB_B },
    create: { id: SUB_B, tenantId: BUYER, planId: PLAN_SCALE, status: 'ACTIVE' },
    update: { status: 'ACTIVE', planId: PLAN_SCALE },
  });
  await db.admin.subscription.upsert({
    where: { id: SUB_B2 },
    create: { id: SUB_B2, tenantId: BUYER2, planId: PLAN_SCALE, status: 'ACTIVE' },
    update: { status: 'ACTIVE', planId: PLAN_SCALE },
  });
  // The creator's source agent.
  await db.admin.agent.upsert({
    where: { id: SRC_AGENT },
    create: {
      id: SRC_AGENT,
      tenantId: CREATOR,
      name: 'Sales Pro',
      persona: { systemPrompt: 'You are a great sales agent.' },
      type: 'OUTBOUND',
      languages: ['en'],
    },
    update: {},
  });
  await wallet.topUp(BUYER, { amountCents: 1_000_000, key: `seed-${Date.now()}` });
  await wallet.topUp(BUYER2, { amountCents: 1_000_000, key: `seed2-${Date.now()}` });
});

afterAll(async () => {
  await db.admin.marketplaceReview.deleteMany({
    where: { buyerTenantId: { in: [CREATOR, BUYER, BUYER2] } },
  });
  await db.admin.marketplacePurchase.deleteMany({
    where: { buyerTenantId: { in: [CREATOR, BUYER, BUYER2] } },
  });
  await db.admin.marketplaceListing.deleteMany({
    where: { creatorTenantId: { in: [CREATOR, BUYER, BUYER2] } },
  });
  await db.admin.walletLedger.deleteMany({ where: { tenantId: { in: [CREATOR, BUYER, BUYER2] } } });
  await db.admin.wallet.deleteMany({ where: { tenantId: { in: [CREATOR, BUYER, BUYER2] } } });
  await db.admin.flowVersion.deleteMany({ where: { tenantId: { in: [CREATOR, BUYER, BUYER2] } } });
  await db.admin.flow.deleteMany({ where: { tenantId: { in: [CREATOR, BUYER, BUYER2] } } });
  await db.admin.agent.deleteMany({ where: { tenantId: { in: [CREATOR, BUYER, BUYER2] } } });
  await db.admin.subscription.deleteMany({ where: { id: { in: [SUB_C, SUB_B, SUB_B2] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [CREATOR, BUYER, BUYER2] } } });
});

let listingId = '';

describe('Marketplace publish + review (self-audit C)', () => {
  it('publishes a draft, and a draft is NOT purchasable', async () => {
    const l = await svc.publish(CREATOR, {
      sourceAgentId: SRC_AGENT,
      title: 'Sales Pro Template',
      description: 'A proven outbound sales agent',
      priceCents: 5000,
    });
    listingId = l.id;
    expect(l.status).toBe('draft');
    expect((await svc.myListings(CREATOR)).some((x) => x.id === listingId)).toBe(true);

    await expect(svc.purchase(BUYER, listingId)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });

  it('submit → pending → platform approve → browsable', async () => {
    await svc.setStatus(CREATOR, listingId, 'pending');
    const approved = await svc.review(listingId, 'approve');
    expect(approved.status).toBe('approved');
    expect((await svc.browse()).some((x) => x.id === listingId)).toBe(true);
  });

  it('a creator cannot self-approve', async () => {
    await expect(svc.setStatus(CREATOR, listingId, 'approved')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });
});

describe('Marketplace purchase + rev-share + clone (self-audit D/B)', () => {
  it('charges the buyer, pays the creator, and clones into the BUYER tenant', async () => {
    const buyerBefore = (await wallet.getBalance(BUYER)).balanceCents;
    const creatorBefore = (await wallet.getBalance(CREATOR)).balanceCents;

    const p = await svc.purchase(BUYER, listingId);
    expect(p.pricePaidCents).toBe(5000);
    expect(p.creatorCents).toBe(3500); // 70% default
    expect(p.platformCents).toBe(1500);
    expect(p.clonedAgentId).toBeTruthy();

    // Buyer charged full price; creator paid its 70% share.
    expect(buyerBefore - (await wallet.getBalance(BUYER)).balanceCents).toBe(5000);
    expect((await wallet.getBalance(CREATOR)).balanceCents - creatorBefore).toBe(3500);

    // The cloned agent lives in the BUYER's tenant (isolation).
    const cloned = await db.admin.agent.findFirst({
      where: { id: p.clonedAgentId ?? '' },
      select: { tenantId: true, name: true },
    });
    expect(cloned?.tenantId).toBe(BUYER);
  });

  it('never double-charges / double-clones on a repeat purchase', async () => {
    const buyerBefore = (await wallet.getBalance(BUYER)).balanceCents;
    const agentsBefore = await db.admin.agent.count({ where: { tenantId: BUYER } });
    const again = await svc.purchase(BUYER, listingId);
    expect(again.pricePaidCents).toBe(5000);
    expect((await wallet.getBalance(BUYER)).balanceCents).toBe(buyerBefore); // no re-charge
    expect(await db.admin.agent.count({ where: { tenantId: BUYER } })).toBe(agentsBefore); // no re-clone
  });

  it('a creator cannot buy their own listing', async () => {
    await expect(svc.purchase(CREATOR, listingId)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });
});

describe('Marketplace ratings + payouts', () => {
  it('a buyer rates; the listing rating updates; a non-buyer cannot rate', async () => {
    const rated = await svc.rate(BUYER, listingId, { rating: 5, comment: 'excellent' });
    expect(rated.ratingCount).toBe(1);
    expect(rated.ratingSum).toBe(5);
    // The creator never purchased → cannot rate.
    await expect(svc.rate(CREATOR, listingId, { rating: 1 })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('creator payouts reflect the sale', async () => {
    const payouts = await svc.payouts(CREATOR);
    expect(payouts.earnedCents).toBe(3500);
    expect(payouts.sales).toBe(1);
  });
});

describe('Marketplace isolation (self-audit B)', () => {
  it('a buyer cannot see the creator’s private listings or an unapproved listing', async () => {
    // A fresh draft from the creator is NOT in the public browse.
    const draft = await svc.publish(CREATOR, {
      sourceAgentId: SRC_AGENT,
      title: 'Hidden Draft Template',
      priceCents: 1000,
    });
    expect((await svc.browse()).some((x) => x.id === draft.id)).toBe(false);
    // The buyer's own listing view never includes the creator's listings.
    expect((await svc.myListings(BUYER)).some((x) => x.creatorTenantId === CREATOR)).toBe(false);
  });
});

describe('Marketplace purchase resume — partial-failure recovery (self-audit D)', () => {
  it('resumes an INCOMPLETE purchase to completion: exactly one charge, exactly one sale increment', async () => {
    // Simulate a prior attempt that reserved the purchase row but died BEFORE charging/cloning
    // (clonedAgentId is null). This is the partial-failure window the adversarial review probed.
    const reserved = await db.admin.marketplacePurchase.create({
      data: {
        buyerTenantId: BUYER2,
        listingId,
        pricePaidCents: 5000,
        creatorCents: 3500,
        platformCents: 1500,
      },
      select: { id: true },
    });

    const buyerBefore = (await wallet.getBalance(BUYER2)).balanceCents;
    const listingBefore = await db.admin.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { purchaseCount: true },
    });

    // Resuming the purchase must complete it exactly once (charge + clone + one count bump).
    const p = await svc.purchase(BUYER2, listingId);
    expect(p.id).toBe(reserved.id); // resumed the SAME row, not a new one
    expect(p.clonedAgentId).toBeTruthy();
    expect(buyerBefore - (await wallet.getBalance(BUYER2)).balanceCents).toBe(5000); // charged once
    const cloned = await db.admin.agent.findFirst({
      where: { id: p.clonedAgentId ?? '' },
      select: { tenantId: true },
    });
    expect(cloned?.tenantId).toBe(BUYER2); // clone landed in the resuming buyer's tenant

    const listingAfter = await db.admin.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { purchaseCount: true },
    });
    expect(listingAfter.purchaseCount).toBe(listingBefore.purchaseCount + 1); // counted once

    // A further call is a pure replay: no extra charge, no extra sale increment.
    const again = await svc.purchase(BUYER2, listingId);
    expect(again.clonedAgentId).toBe(p.clonedAgentId);
    expect((await wallet.getBalance(BUYER2)).balanceCents).toBe(buyerBefore - 5000);
    const listingFinal = await db.admin.marketplaceListing.findUniqueOrThrow({
      where: { id: listingId },
      select: { purchaseCount: true },
    });
    expect(listingFinal.purchaseCount).toBe(listingBefore.purchaseCount + 1);
  });
});
