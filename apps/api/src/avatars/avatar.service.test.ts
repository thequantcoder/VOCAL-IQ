import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { AvatarService, mockAvatarProvider, unavailableAvatarProvider } from './avatar.service';

/**
 * Video-avatar agents (Day 92) — real Postgres, RLS-scoped. Proves the likeness-consent gate, the
 * plan-gated video with GRACEFUL voice fallback (plan / provider / no-avatar), per-second cost
 * metering (self-audit D), per-agent binding, and tenant isolation. Video entitlement + the provider
 * are injected so every path is reproducible without a vendor.
 */

const db = new PrismaService();
// Entitled + provider ready → video can run.
const svc = new AvatarService(db, async () => true, mockAvatarProvider());
// Not entitled → must fall back to voice.
const svcNoPlan = new AvatarService(db, async () => false, mockAvatarProvider());
// Entitled but no provider → must fall back to voice.
const svcNoProvider = new AvatarService(db, async () => true, unavailableAvatarProvider());

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T1 = '00000000-0000-0000-0000-0000092a0001';
const T2 = '00000000-0000-0000-0000-0000092a0002';
const AGENT = '00000000-0000-0000-0000-0000092a00a1';
let avatarId = '';

beforeAll(async () => {
  for (const id of [T1, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Avatar ${id.slice(-4)}`,
        slug: `avatar-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
});

afterAll(async () => {
  await db.admin.avatarSession.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.avatar.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T1, T2] } } });
});

describe('Catalogue + likeness consent (self-audit C)', () => {
  it('creates a stock avatar with no consent needed', async () => {
    const a = await svc.createAvatar(T1, { name: 'Ava', providerAvatarId: 'stock-1' });
    expect(a.kind).toBe('stock');
    expect(a.likenessConsentAt).toBeNull();
    avatarId = a.id;
  });
  it('refuses a custom avatar without explicit likeness consent, allows it with', async () => {
    await expect(
      svc.createAvatar(T1, { name: 'Real Person', providerAvatarId: 'c1', kind: 'custom' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
    const c = await svc.createAvatar(T1, {
      name: 'Real Person',
      providerAvatarId: 'c1',
      kind: 'custom',
      likenessConsent: true,
    });
    expect(c.likenessConsentAt).not.toBeNull();
  });
});

describe('Plan-gated video with graceful fallback (self-audit D/F)', () => {
  it('falls back to voice when the plan does not entitle video', async () => {
    const s = await svcNoPlan.startSession(T1, { avatarId, requestVideo: true });
    expect(s.mode).toBe('voice');
    expect(s.fallback).toBe(true);
    expect(s.fallbackReason).toBe('plan');
    expect(s.decision.mode).toBe('voice');
  });
  it('falls back to voice when no provider is available', async () => {
    const s = await svcNoProvider.startSession(T1, { avatarId, requestVideo: true });
    expect(s.mode).toBe('voice');
    expect(s.fallbackReason).toBe('provider_unavailable');
  });
  it('falls back to voice when no avatar is selected', async () => {
    const s = await svc.startSession(T1, { requestVideo: true });
    expect(s.mode).toBe('voice');
    expect(s.fallbackReason).toBe('no_avatar');
  });
});

describe('Video session lifecycle + cost metering (self-audit D)', () => {
  it('runs video, meters per second, and attributes cost on end', async () => {
    const s = await svc.startSession(T1, { avatarId, requestVideo: true });
    expect(s.mode).toBe('video');
    expect(s.fallback).toBe(false);
    expect(s.providerRef).toBe('mock:stock-1');
    expect(s.costUsd).toBe(0); // not metered until it ends

    await svc.addSeconds(T1, s.id, 60);
    const ended = await svc.endSession(T1, s.id);
    expect(ended.status).toBe('ended');
    expect(ended.seconds).toBe(60);
    expect(ended.costUsd).toBeCloseTo(1.2, 5); // 60s × $0.02

    // A voice-fallback session costs nothing even with seconds logged.
    const v = await svcNoPlan.startSession(T1, { avatarId });
    await svc.addSeconds(T1, v.id, 120);
    const vEnded = await svc.endSession(T1, v.id);
    expect(vEnded.costUsd).toBe(0);
  });

  it('resolves the avatar from a per-agent binding', async () => {
    await svc.setAgentAvatar(T1, AGENT, avatarId);
    const s = await svc.startSession(T1, { agentId: AGENT, requestVideo: true });
    expect(s.mode).toBe('video');
    expect(s.avatarId).toBe(avatarId);
  });
});

describe('Isolation (self-audit B)', () => {
  it('a tenant never sees another tenant’s avatars or sessions', async () => {
    expect(await svc.listAvatars(T2)).toHaveLength(0);
    const s = await svc.startSession(T1, { avatarId, requestVideo: true });
    await expect(svc.getSession(T2, s.id)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });
});
