import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { TranscriptIngestService, checkInternalSecret } from './transcript-ingest';

/**
 * Voice→api transcript ingest (real Postgres + RLS). Proves: a valid report upserts the Transcript
 * (create then replace), the claimed tenant is enforced (a cross-tenant call id 404s — self-audit B),
 * the post-ingest hook fires, and the pure secret check is gated/constant-time-shaped.
 */

const db = new PrismaService();
const C1 = '00000000-0000-0000-0000-000000000003';
const R1 = '00000000-0000-0000-0000-000000000002'; // parent tenant (cross-tenant probe)
const AGENT = '00000000-0000-0000-0000-0000f1a00001';
const CALL = '00000000-0000-0000-0000-0000f1a00002';

beforeAll(async () => {
  const a = db.admin;
  await a.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: C1, name: 'Ingest Agent' },
    update: {},
  });
  await a.call.upsert({
    where: { id: CALL },
    create: {
      id: CALL,
      tenantId: C1,
      agentId: AGENT,
      direction: 'INBOUND',
      channel: 'WEB',
      status: 'COMPLETED',
    },
    update: {},
  });
});

afterAll(async () => {
  await db.admin.transcript.deleteMany({ where: { callId: CALL } });
  await db.admin.call.deleteMany({ where: { id: CALL } });
  await db.admin.agent.deleteMany({ where: { id: AGENT } });
});

describe('TranscriptIngestService.ingest', () => {
  it('persists the reported segments (upsert) and fires the post-ingest hook', async () => {
    const hooks: string[] = [];
    const svc = new TranscriptIngestService(db, async (tid, callId) => {
      hooks.push(`${tid}:${callId}`);
    });

    const res = await svc.ingest({
      call_id: CALL,
      tenant_id: C1,
      segments: [
        { role: 'assistant', text: 'How can I help?' },
        { role: 'user', text: 'I am Ada' },
      ],
    });
    expect(res).toEqual({ ok: true, callId: CALL });

    const t = await db.admin.transcript.findUnique({ where: { callId: CALL } });
    expect((t?.segments as { text: string }[])?.[1]?.text).toBe('I am Ada');
    // Fire-and-forget hook — allow the microtask to land.
    await new Promise((r) => setTimeout(r, 10));
    expect(hooks).toEqual([`${C1}:${CALL}`]);

    // A re-report REPLACES the segments (upsert path).
    await svc.ingest({
      call_id: CALL,
      tenant_id: C1,
      segments: [{ role: 'user', text: 'updated' }],
    });
    const t2 = await db.admin.transcript.findUnique({ where: { callId: CALL } });
    expect(t2?.segments).toEqual([{ role: 'user', text: 'updated' }]);
  });

  it('404s a call id claimed under the WRONG tenant (cross-tenant guard, self-audit B)', async () => {
    const svc = new TranscriptIngestService(db);
    await expect(
      svc.ingest({ call_id: CALL, tenant_id: R1, segments: [{ role: 'user', text: 'x' }] }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'NOT_FOUND');
  });

  it('rejects a malformed report', async () => {
    const svc = new TranscriptIngestService(db);
    await expect(
      svc.ingest({ call_id: 'not-a-uuid', tenant_id: C1, segments: [] }),
    ).rejects.toSatisfy((e) => isAppError(e) && e.code === 'VALIDATION');
  });
});

describe('checkInternalSecret', () => {
  it('is gated with no configured secret, 401-shaped on mismatch, ok on match', () => {
    expect(checkInternalSecret('x', undefined)).toBe('gated');
    expect(checkInternalSecret(undefined, 'sek')).toBe('unauthorized');
    expect(checkInternalSecret('wrong', 'sek')).toBe('unauthorized');
    expect(checkInternalSecret('sekk', 'sek')).toBe('unauthorized'); // length mismatch
    expect(checkInternalSecret('sek', 'sek')).toBe('ok');
  });
});
