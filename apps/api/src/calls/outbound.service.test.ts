import { isAppError } from '@vocaliq/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { type DialRequest, type Dialer } from './dialer';
import { OutboundService } from './outbound.service';

/**
 * Outbound orchestration + gates (real Postgres, RLS-scoped). Proves the Day-10
 * self-audit focus: DNC + consent blocks abuse, the concurrency cap holds, and a vetted
 * call is persisted + handed to the dialer with its cost/disposition recorded at end.
 */

const db = new PrismaService();

class FakeDialer implements Dialer {
  readonly dispatched: DialRequest[] = [];
  async dial(req: DialRequest): Promise<void> {
    this.dispatched.push(req);
  }
}

// Seeded customer tenant (present after `prisma db seed`).
const C1 = '00000000-0000-0000-0000-000000000003';
const AGENT = '00000000-0000-0000-0000-0000001a0001';
const CONTACT_DNC = '00000000-0000-0000-0000-0000001a0002';
const CONTACT_OK = '00000000-0000-0000-0000-0000001a0003';
const TO = '+15551230001';
const DNC_PHONE = '+15559990000';

const base = { agentId: AGENT, to: TO, consentBasis: 'EXPRESS_WRITTEN' as const };

beforeAll(async () => {
  const a = db.admin;
  await a.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Outbound Agent' },
    update: {},
  });
  await a.contact.upsert({
    where: { id: CONTACT_DNC },
    create: { id: CONTACT_DNC, tenantId: C1, phone: DNC_PHONE, dnc: true },
    update: { dnc: true },
  });
  await a.contact.upsert({
    where: { id: CONTACT_OK },
    create: { id: CONTACT_OK, tenantId: C1, phone: TO, dnc: false },
    update: { dnc: false },
  });
});

afterEach(async () => {
  await db.admin.call.deleteMany({ where: { agentId: AGENT } });
});

afterAll(async () => {
  await db.admin.call.deleteMany({ where: { agentId: AGENT } });
  await db.admin.contact.deleteMany({ where: { id: { in: [CONTACT_DNC, CONTACT_OK] } } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
});

function svc(dialer: Dialer = new FakeDialer()) {
  return { service: new OutboundService(db, dialer), dialer };
}

describe('OutboundService.placeCall', () => {
  it('places a vetted call: persists QUEUED + dispatches to the dialer', async () => {
    const { service, dialer } = svc();
    const res = await service.placeCall(C1, { ...base, contactId: CONTACT_OK });

    expect(res.status).toBe('QUEUED');
    expect(res.consentBasis).toBe('EXPRESS_WRITTEN');
    const row = await db.admin.call.findUnique({ where: { id: res.callId } });
    expect(row?.direction).toBe('OUTBOUND');
    expect(row?.channel).toBe('PSTN');
    expect(row?.contactId).toBe(CONTACT_OK);
    expect((dialer as FakeDialer).dispatched).toHaveLength(1);
    expect((dialer as FakeDialer).dispatched[0]?.to).toBe(TO);
  });

  it('blocks a DNC-flagged contact (ForbiddenError, nothing dialed)', async () => {
    const { service, dialer } = svc();
    await expect(
      service.placeCall(C1, { ...base, to: DNC_PHONE, contactId: CONTACT_DNC }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'FORBIDDEN');
    expect((dialer as FakeDialer).dispatched).toHaveLength(0);
  });

  it('blocks a phone number on the DNC list even without a contactId', async () => {
    const { service } = svc();
    await expect(service.placeCall(C1, { ...base, to: DNC_PHONE })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'FORBIDDEN',
    );
  });

  it('requires a consent basis (ValidationError)', async () => {
    const { service } = svc();
    await expect(service.placeCall(C1, { agentId: AGENT, to: TO })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('rejects a non-E.164 destination', async () => {
    const { service } = svc();
    await expect(service.placeCall(C1, { ...base, to: '5551234' })).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'VALIDATION',
    );
  });

  it('404s an unknown agent', async () => {
    const { service } = svc();
    await expect(
      service.placeCall(C1, { ...base, agentId: '00000000-0000-0000-0000-0000009a9999' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'NOT_FOUND');
  });

  it('enforces the outbound concurrency cap', async () => {
    // Fill the cap (10) with in-flight outbound calls, then the next is refused.
    const a = db.admin;
    for (let i = 0; i < 10; i++) {
      await a.call.create({
        data: {
          tenantId: C1,
          agentId: AGENT,
          direction: 'OUTBOUND',
          channel: 'PSTN',
          status: 'IN_PROGRESS',
        },
      });
    }
    const { service, dialer } = svc();
    await expect(service.placeCall(C1, base)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'RATE_LIMIT',
    );
    expect((dialer as FakeDialer).dispatched).toHaveLength(0);
  });
});

describe('OutboundService.recordDisposition', () => {
  it('records disposition + terminal status + cost breakdown', async () => {
    const { service } = svc();
    const { callId } = await service.placeCall(C1, base);

    const updated = await service.recordDisposition(C1, callId, {
      disposition: 'ANSWERED_HUMAN',
      status: 'COMPLETED',
      durationSec: 42,
      costBreakdown: { stt: 0.001, llm: 0.002, tts: 0.003, telephony: 0.014, total: 0.02 },
    });

    expect(updated.status).toBe('COMPLETED');
    expect(updated.disposition).toBe('ANSWERED_HUMAN');
    expect((updated.costBreakdown as Record<string, number>).total).toBeCloseTo(0.02, 6);
  });

  it('rejects a non-terminal status', async () => {
    const { service } = svc();
    const { callId } = await service.placeCall(C1, base);
    await expect(
      service.recordDisposition(C1, callId, { disposition: 'x', status: 'RINGING' }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });

  it('404s an unknown call', async () => {
    const { service } = svc();
    await expect(
      service.recordDisposition(C1, '00000000-0000-0000-0000-0000009c9999', {
        disposition: 'x',
        status: 'COMPLETED',
      }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'NOT_FOUND');
  });
});
