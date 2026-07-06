import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import {
  CustomModelsService,
  DisabledFineTuneProvider,
  type FineTuneProvider,
} from './custom-models.service';

/**
 * Custom models per tenant (Day 76) against real Postgres. Proves the consent gate (self-audit C),
 * the CRITICAL tenant isolation — a custom model can never be read/resolved/bound across tenants
 * (self-audit B) — the router routing resolution, and the gated fine-tune seam (self-audit D — a
 * system-prompt model works with no fine-tune provider).
 */

const db = new PrismaService();
const svc = new CustomModelsService(db, new DisabledFineTuneProvider());

// A stub provider that DOES fine-tune, to exercise the training → ready path deterministically.
const stubFineTune: FineTuneProvider = {
  enabled: true,
  startFineTune: async () => ({ fineTuneId: 'ft:stub:123' }),
};
const svcWithFt = new CustomModelsService(db, stubFineTune);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T = '00000000-0000-0000-0000-0000076a0001';
const T2 = '00000000-0000-0000-0000-0000076a0002';
const AGENT_T = '00000000-0000-0000-0000-0000076a00a1';

const consent = {
  consentGiven: true as const,
  consentedBy: 'Jane Owner',
  consentText: 'Trained on our data.',
};

beforeAll(async () => {
  for (const id of [T, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Model ${id.slice(-4)}`,
        slug: `model-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT_T },
    create: { id: AGENT_T, tenantId: T, name: 'Model Test Agent' },
    update: { customModelId: null },
  });
});

afterAll(async () => {
  await db.admin.agent.updateMany({ where: { id: AGENT_T }, data: { customModelId: null } });
  await db.admin.customModel.deleteMany({ where: { tenantId: { in: [T, T2] } } });
  await db.admin.agent.deleteMany({ where: { id: AGENT_T } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T, T2] } } });
});

describe('CustomModelsService.create (consent — self-audit C)', () => {
  it('refuses to create a model without consent', async () => {
    await expect(
      svc.create(T, {
        name: 'NoConsent',
        provider: 'OPENAI',
        baseModel: 'gpt-4o',
        consent: { consentGiven: false },
      }),
    ).rejects.toThrow();
  });

  it('creates a system-prompt customised model (ready, no fine-tune) when consent is given', async () => {
    const m = await svc.create(T, {
      name: 'ACME Brand',
      provider: 'OPENAI',
      baseModel: 'gpt-4o',
      systemPrompt: 'Speak in the ACME brand voice.',
      consent,
    });
    expect(m.status).toBe('ready');
    expect(m.fineTuneId).toBeNull();
    expect(m.consentBy).toBe('Jane Owner');
  });
});

describe('CustomModelsService fine-tune seam (self-audit D — gated)', () => {
  it('refuses a provider fine-tune when none is configured', async () => {
    await expect(
      svc.create(T, {
        name: 'FT',
        provider: 'OPENAI',
        baseModel: 'gpt-4o',
        requestFineTune: true,
        consent,
      }),
    ).rejects.toThrow(/not configured/i);
  });

  it('kicks off training then marks ready when a provider IS configured', async () => {
    const m = await svcWithFt.create(T, {
      name: 'ACME FT',
      provider: 'OPENAI',
      baseModel: 'gpt-4o',
      requestFineTune: true,
      consent,
    });
    expect(m.status).toBe('training');
    expect(m.fineTuneId).toBe('ft:stub:123');
    const ready = await svcWithFt.markTrained(T, m.id, 'ft:stub:123');
    expect(ready.status).toBe('ready');
  });
});

describe('CustomModelsService routing + agent binding', () => {
  it('resolves an agent’s bound model to router routing', async () => {
    const m = await svc.create(T, {
      name: 'Routing Model',
      provider: 'ANTHROPIC',
      baseModel: 'claude-sonnet-4-6',
      systemPrompt: 'Be concise.',
      consent,
    });
    await svc.assignToAgent(T, AGENT_T, m.id);
    const routing = await svc.resolveForAgent(T, AGENT_T);
    expect(routing).toEqual({
      provider: 'ANTHROPIC',
      model: 'claude-sonnet-4-6',
      system: 'Be concise.',
    });
  });

  it('returns null routing for an agent with no custom model', async () => {
    await svc.assignToAgent(T, AGENT_T, null);
    expect(await svc.resolveForAgent(T, AGENT_T)).toBeNull();
  });
});

describe('CustomModelsService tenant isolation (self-audit B — CRITICAL)', () => {
  it('a second tenant can never read, resolve, or bind another tenant’s model', async () => {
    const m = await svc.create(T, {
      name: 'Private',
      provider: 'OPENAI',
      baseModel: 'gpt-4o',
      consent,
    });
    await svc.assignToAgent(T, AGENT_T, m.id);

    // T2 cannot read T's model…
    await expect(svc.get(T2, m.id)).rejects.toThrow(/not found/i);
    // …cannot see it in its own list…
    expect(await svc.list(T2)).toEqual([]);
    // …cannot resolve T's agent (RLS hides the agent → null, never T's model)…
    expect(await svc.resolveForAgent(T2, AGENT_T)).toBeNull();
    // …and cannot bind T's agent to anything.
    await expect(svc.assignToAgent(T2, AGENT_T, m.id)).rejects.toThrow(/not found/i);
  });
});
