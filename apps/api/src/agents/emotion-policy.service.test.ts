import { DEFAULT_EMOTION_POLICY, isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../db/prisma.service';
import { AgentsService } from './agents.service';

/**
 * Emotion-aware voice policy (Day 77) — real Postgres, RLS-scoped. Proves defaults, validation, and
 * the CRITICAL cross-tenant isolation: a tenant can never read or write another tenant's agent
 * policy (golden rule #1 / self-audit B).
 */

const db = new PrismaService();
const svc = new AgentsService(db, new EntitlementsService(db));

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000077a0001';
const T2 = '00000000-0000-0000-0000-0000077a0002';
const AGENT_T = '00000000-0000-0000-0000-0000077a00a1';

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Emotion ${id.slice(-4)}`,
        slug: `emotion-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT_T },
    create: { id: AGENT_T, tenantId: T, name: 'Emotion Test Agent' },
    update: { emotionPolicy: {} },
  });
});

afterAll(async () => {
  await db.admin.agent.deleteMany({ where: { id: AGENT_T } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('AgentsService emotion policy', () => {
  it('returns the disabled default for a fresh agent', async () => {
    expect(await svc.getEmotionPolicy(T, AGENT_T)).toEqual(DEFAULT_EMOTION_POLICY);
  });

  it('validates + persists a policy and reads it back', async () => {
    const saved = await svc.setEmotionPolicy(T, AGENT_T, {
      enabled: true,
      expressiveness: 'expressive',
      maxStyle: 0.5,
      angerThreshold: 0.4,
    });
    expect(saved.enabled).toBe(true);
    expect(saved.expressiveness).toBe('expressive');
    const read = await svc.getEmotionPolicy(T, AGENT_T);
    expect(read).toEqual(saved);
    // Reset so the isolation test starts from a known state.
    await svc.setEmotionPolicy(T, AGENT_T, {});
  });

  it('rejects an out-of-range policy', async () => {
    await expect(svc.setEmotionPolicy(T, AGENT_T, { maxStyle: 5 })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
    await expect(svc.setEmotionPolicy(T, AGENT_T, { expressiveness: 'wild' })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('404s an unknown agent', async () => {
    await expect(svc.getEmotionPolicy(T, '00000000-0000-0000-0000-0000077affff')).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });
});

describe('AgentsService emotion policy — tenant isolation (self-audit B — CRITICAL)', () => {
  it('a second tenant can neither read nor write another tenant’s agent policy', async () => {
    await svc.setEmotionPolicy(T, AGENT_T, { enabled: true, expressiveness: 'subtle' });

    // T2 cannot read T's agent policy (RLS hides the agent → NotFound)…
    await expect(svc.getEmotionPolicy(T2, AGENT_T)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
    // …and cannot write it either.
    await expect(svc.setEmotionPolicy(T2, AGENT_T, { enabled: false })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );

    // T's policy is untouched by the cross-tenant attempts.
    const still = await svc.getEmotionPolicy(T, AGENT_T);
    expect(still.enabled).toBe(true);
    expect(still.expressiveness).toBe('subtle');
  });
});
