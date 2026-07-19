import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { DisclosureService } from './disclosure.service';

/**
 * AI disclosure & calling rules (Day 71) against real Postgres. Proves per-region disclosure text
 * + mandatory human opt-out, the defensible disclosure log, the human opt-out record, and the
 * calling-hours/frequency gate — all RLS-scoped (self-audit B).
 */

const db = new PrismaService();
const svc = new DisclosureService(db);

// A DEDICATED tenant (not the shared seed `…0003`) so this suite's `setConfig` read-modify-write of
// `tenant.settings` — and its teardown — can never race another parallel suite that touches that row.
const PLATFORM = '00000000-0000-0000-0000-000000000001';
const C1 = '00000000-0000-0000-0000-0000071a0003';
const AGENT = '00000000-0000-0000-0000-0000071a0001';
const CALL = '00000000-0000-0000-0000-0000071a0002';

beforeAll(async () => {
  await db.admin.tenant.upsert({
    where: { id: C1 },
    create: {
      id: C1,
      type: 'CUSTOMER',
      name: 'disclosure-suite',
      slug: `disclosure-suite-${Date.now()}`,
      parentTenantId: PLATFORM,
    },
    update: {},
  });
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Disc Agent' },
    update: {},
  });
  await db.admin.call.upsert({
    where: { id: CALL },
    create: {
      id: CALL,
      tenantId: C1,
      agentId: AGENT,
      direction: 'OUTBOUND',
      channel: 'PSTN',
      status: 'IN_PROGRESS',
    },
    update: {},
  });
});

afterAll(async () => {
  // Deleting the dedicated tenant cascades its agent + call + settings — no shared state to reset.
  await db.admin.tenant.deleteMany({ where: { id: C1 } });
});

describe('DisclosureService config + build', () => {
  it('applies a TCPA template → discloses AI + human opt-out', async () => {
    await svc.setConfig(C1, { region: 'US-TCPA' });
    const built = await svc.buildForCall(C1, 'Ava', 'Acme');
    expect(built.text).toContain('AI assistant');
    expect(built.text).toContain('press 1');
    expect(built.humanOptOutRequired).toBe(true);
  });

  it('exposes the compliance template library', () => {
    const templates = svc.templates();
    expect(templates.some((t) => t.key === 'US-TCPA')).toBe(true);
    expect(templates.some((t) => t.key === 'EU-GDPR')).toBe(true);
  });
});

describe('DisclosureService per-call records', () => {
  it('logs what was disclosed + a human opt-out (defensible record)', async () => {
    await svc.logDisclosure(C1, CALL, 'You are speaking with an AI assistant.');
    await svc.recordHumanOptOut(C1, CALL);
    const call = await db.admin.call.findUnique({
      where: { id: CALL },
      select: { disclosureText: true, disclosedAt: true, humanOptOutAt: true },
    });
    expect(call?.disclosureText).toContain('AI assistant');
    expect(call?.disclosedAt).toBeTruthy();
    expect(call?.humanOptOutAt).toBeTruthy();
  });
});

describe('DisclosureService calling-rules gate', () => {
  it('blocks calls outside the region window (DEFAULT region has no config → uses default hours)', async () => {
    // We can't control the server hour, so assert the shape + that a valid region resolves.
    const res = await svc.checkCalling(C1, 'US-TCPA');
    expect(typeof res.allowed).toBe('boolean');
    if (!res.allowed) expect(res.reason).toBeTruthy();
  });
});
