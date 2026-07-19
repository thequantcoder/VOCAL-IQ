import { MessengerCallingTelephony } from '@vocaliq/provider-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import type { MeAdapterResolver } from './messenger-calling.service';
import { MessengerPermissionService } from './messenger-permission.service';

/**
 * MEC-08 outbound governor against real Postgres + RLS. Verifies the LIVE-permission read (fail-closed when
 * gated), the history-derived unanswered back-off, DNC, and Meta's rate verdict — all without a real Graph
 * call (a fake HTTP transport feeds the adapter its permission JSON).
 */
const db = new PrismaService();
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000ff34a001';
const NOW = new Date('2026-07-19T12:00:00Z');

/** A fake Graph transport that always returns `json` with 200 — structurally a provider-router `MeHttp`. */
const httpReturning =
  (json: unknown) =>
  async (
    _url: string,
    _init: { method: string; headers: Record<string, string>; body?: string },
  ) => ({ ok: true, status: 200, text: async () => JSON.stringify(json) });

/** An adapter resolver that answers `getCallPermission` with the given Graph permission body. */
const liveResolver =
  (permissionJson: unknown): MeAdapterResolver =>
  async () =>
    new MessengerCallingTelephony('tok', { http: httpReturning(permissionJson) });

/** Gated: no adapter (unconfigured tenant). */
const gatedResolver: MeAdapterResolver = async () => null;

const svc = (resolver: MeAdapterResolver) =>
  new MessengerPermissionService(db, resolver, () => NOW);

/** A permanent, call-allowed permission body in Meta's Call-Permissions shape. */
const permanentAllowed = {
  permission: { status: 'permanent' },
  actions: [{ action_name: 'CALL', can_perform_action: true, limits: [] }],
};

async function seedOutboundCall(
  meCallId: string,
  psid: string,
  answered: boolean,
  createdAt: Date,
): Promise<void> {
  await db.admin.messengerCall.create({
    data: {
      tenantId: T,
      meCallId,
      direction: 'BUSINESS_INITIATED',
      status: answered ? 'completed' : 'failed',
      psid,
      durationSec: answered ? 42 : 0,
      createdAt,
    },
  });
}

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: T },
    create: {
      id: T,
      type: 'CUSTOMER',
      name: 'mec8-perm',
      slug: `mec8-perm-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.tenant.deleteMany({ where: { id: T } });
});

describe('MessengerPermissionService — live permission (MEC-08)', () => {
  it('fails closed when gated (no adapter) — never dial without a live grant', async () => {
    const res = await svc(gatedResolver).canCall(T, { psid: 'PSID_GATED' });
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('no_permission');
    expect(res.permission.live).toBe(false);
  });

  it('allows a live permanent, in-limits contact with no unanswered history', async () => {
    const res = await svc(liveResolver(permanentAllowed)).canCall(T, { psid: 'PSID_OK' });
    expect(res.allowed).toBe(true);
    expect(res.permission.live).toBe(true);
    expect(res.permission.status).toBe('permanent');
  });

  it('blocks when Meta reports no_permission', async () => {
    const res = await svc(
      liveResolver({ permission: { status: 'no_permission' }, actions: [] }),
    ).canCall(T, { psid: 'PSID_NOPERM' });
    expect(res).toMatchObject({ allowed: false, reason: 'no_permission' });
  });

  it('blocks when Meta’s call action cannot be performed (rate_limited)', async () => {
    const res = await svc(
      liveResolver({
        permission: { status: 'permanent' },
        actions: [{ action_name: 'CALL', can_perform_action: false, limits: [] }],
      }),
    ).canCall(T, { psid: 'PSID_RATE' });
    expect(res).toMatchObject({ allowed: false, reason: 'rate_limited' });
  });
});

describe('MessengerPermissionService — derived unanswered back-off (MEC-08)', () => {
  it('blocks after 3 consecutive unanswered outbound calls', async () => {
    const psid = 'PSID_BACKOFF';
    await seedOutboundCall('mec8.bo.1', psid, false, new Date('2026-07-19T09:00:00Z'));
    await seedOutboundCall('mec8.bo.2', psid, false, new Date('2026-07-19T10:00:00Z'));
    await seedOutboundCall('mec8.bo.3', psid, false, new Date('2026-07-19T11:00:00Z'));

    const res = await svc(liveResolver(permanentAllowed)).canCall(T, { psid });
    expect(res.consecutiveUnanswered).toBe(3);
    expect(res).toMatchObject({ allowed: false, reason: 'unanswered_backoff' });
  });

  it('an answered call breaks the run (trailing unanswered < threshold → allowed)', async () => {
    const psid = 'PSID_MIX';
    // oldest → newest: unanswered, unanswered, ANSWERED, unanswered, unanswered
    await seedOutboundCall('mec8.mix.1', psid, false, new Date('2026-07-19T07:00:00Z'));
    await seedOutboundCall('mec8.mix.2', psid, false, new Date('2026-07-19T08:00:00Z'));
    await seedOutboundCall('mec8.mix.3', psid, true, new Date('2026-07-19T09:00:00Z'));
    await seedOutboundCall('mec8.mix.4', psid, false, new Date('2026-07-19T10:00:00Z'));
    await seedOutboundCall('mec8.mix.5', psid, false, new Date('2026-07-19T11:00:00Z'));

    const res = await svc(liveResolver(permanentAllowed)).canCall(T, { psid });
    expect(res.consecutiveUnanswered).toBe(2); // only the two after the answered one
    expect(res.allowed).toBe(true);
  });
});

describe('MessengerPermissionService — DNC (MEC-08)', () => {
  it('blocks a do-not-call contact even with a live permission', async () => {
    const contact = await db.admin.contact.create({
      data: { tenantId: T, name: 'No Calls', dnc: true },
      select: { id: true },
    });
    const res = await svc(liveResolver(permanentAllowed)).canCall(T, {
      psid: 'PSID_DNC',
      contactId: contact.id,
    });
    expect(res).toMatchObject({ allowed: false, reason: 'dnc' });
  });
});
