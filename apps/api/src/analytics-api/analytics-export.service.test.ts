import { isAppError } from '@vocaliq/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../db/prisma.service';
import { AnalyticsApiService } from './analytics-api.service';
import { AnalyticsExportService } from './analytics-export.service';

/**
 * Voice analytics API + BI exportSvc (Day 87) — real Postgres, RLS-scoped. Proves the paginated read API,
 * PII masking (self-audit C — masked unless pii:read), CSV export integrity + formula-injection safety,
 * schedule CRUD, and cross-tenant isolation.
 */

const db = new PrismaService();
const analytics = new AnalyticsApiService(db);
const exportSvc = new AnalyticsExportService(db, analytics);

const PLATFORM = '00000000-0000-0000-0000-000000000001';
const T1 = '00000000-0000-0000-0000-0000087a0001';
const T2 = '00000000-0000-0000-0000-0000087a0002';
const AGENT = '00000000-0000-0000-0000-0000087a00a1';
const CONTACT = '00000000-0000-0000-0000-0000087a00c1';
const PHONE = '+14155559999';
const within = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  for (const id of [T1, T2]) {
    await db.admin.tenant.upsert({
      where: { id },
      create: {
        id,
        type: 'CUSTOMER',
        name: `Exp ${id.slice(-4)}`,
        slug: `exp-${id.slice(-4)}-${Date.now()}`,
        parentTenantId: PLATFORM,
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
    });
  }
  await db.admin.agent.upsert({
    where: { id: AGENT },
    create: { id: AGENT, tenantId: T1, name: 'BI Agent' },
    update: {},
  });
  await db.admin.contact.upsert({
    where: { id: CONTACT },
    create: { id: CONTACT, tenantId: T1, phone: PHONE, name: 'Jane' },
    update: {},
  });
  // 3 calls; one carries a CSV-injection payload in its disposition to test the writer's guard.
  for (let i = 0; i < 3; i++) {
    const call = await db.admin.call.create({
      data: {
        tenantId: T1,
        agentId: AGENT,
        contactId: CONTACT,
        direction: 'OUTBOUND',
        channel: 'PSTN',
        status: (i === 0 ? 'COMPLETED' : 'FAILED') as never,
        disposition: i === 0 ? '=SUM(A1:A9)' : 'no_answer', // injection payload on the first
        sentiment: 0.5,
        durationSec: 30 + i,
        createdAt: new Date(within.getTime() + i * 1000),
      },
    });
    await db.admin.usageRecord.create({
      data: {
        tenantId: T1,
        callId: call.id,
        provider: 'OPENAI',
        capability: 'llm',
        units: 100,
        costUsd: 0.02,
        ts: new Date(within.getTime() + i * 1000),
      },
    });
  }
});

afterAll(async () => {
  await db.admin.analyticsExport.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.exportSchedule.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.usageRecord.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.call.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.contact.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.agent.deleteMany({ where: { tenantId: { in: [T1, T2] } } });
  await db.admin.tenant.deleteMany({ where: { id: { in: [T1, T2] } } });
});

describe('Analytics read API — PII governance (self-audit C)', () => {
  it('masks the contact phone by default and un-masks with pii:read', async () => {
    const masked = await analytics.listCalls(T1, { limit: 100 }, { includePii: false });
    expect(masked.rows.length).toBe(3);
    expect(masked.rows.every((r) => r.phone !== PHONE)).toBe(true); // masked
    expect(masked.rows[0]!.phone).toContain('•');

    const raw = await analytics.listCalls(T1, { limit: 100 }, { includePii: true });
    expect(raw.rows.some((r) => r.phone === PHONE)).toBe(true); // un-masked
  });

  it('paginates with a keyset cursor', async () => {
    const p1 = await analytics.listCalls(T1, { limit: 2 }, { includePii: false });
    expect(p1.rows.length).toBe(2);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await analytics.listCalls(
      T1,
      { limit: 2, cursor: p1.nextCursor! },
      { includePii: false },
    );
    expect(p2.rows.length).toBe(1); // the remaining row
    // No overlap between pages.
    const ids = new Set(p1.rows.map((r) => r.id));
    expect(p2.rows.every((r) => !ids.has(r.id))).toBe(true);
  });

  it('composite keyset never loses rows sharing an identical timestamp (self-audit A)', async () => {
    // Four calls at the EXACT same createdAt — a createdAt-only cursor would drop rows across pages.
    const sameTs = new Date('2026-07-01T09:00:00.000Z');
    for (let i = 0; i < 4; i++) {
      await db.admin.call.create({
        data: {
          tenantId: T1,
          agentId: AGENT,
          direction: 'OUTBOUND',
          channel: 'PSTN',
          status: 'COMPLETED' as never,
          createdAt: sameTs,
        },
      });
    }
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const res = await analytics.listCalls(
        T1,
        { limit: 2, ...(cursor ? { cursor } : {}) },
        { includePii: false },
      );
      for (const row of res.rows) seen.add(row.id);
      if (!res.nextCursor) break;
      cursor = res.nextCursor;
    }
    // All 4 same-timestamp calls (+ the 3 seed calls) are returned, none skipped.
    expect(seen.size).toBe(7);
    // Clean up the extra calls so later count-based assertions (export rowCount) stay at the 3 seeds.
    await db.admin.call.deleteMany({ where: { tenantId: T1, createdAt: sameTs } });
  });

  it('aggregates usage by day/provider/capability', async () => {
    const usage = await analytics.usage(T1, {});
    expect(usage.length).toBeGreaterThanOrEqual(1);
    expect(usage.some((u) => u.provider === 'OPENAI' && u.capability === 'llm')).toBe(true);
  });
});

describe('CSV export — integrity + injection safety (self-audit C)', () => {
  it('generates a masked-PII CSV with the right rows and neutralizes formula injection', async () => {
    const exp = await exportSvc.create(T1, { kind: 'calls' });
    expect(exp.rowCount).toBe(3);
    const file = await exportSvc.download(T1, exp.id);
    const lines = file.csv.split('\n');
    expect(lines[0]).toBe(
      'id,agentId,phone,direction,status,disposition,sentiment,durationSec,costUsd,startedAt,createdAt',
    );
    // Phone is masked in the export (no raw number leaks into the file).
    expect(file.csv.includes(PHONE)).toBe(false);
    expect(file.csv).toContain('•');
    // The '=SUM(...)' disposition is neutralized so it can't execute in a spreadsheet.
    expect(file.csv).toContain("'=SUM(A1:A9)");
    expect(file.csv).not.toContain(',=SUM(A1:A9)');
  });

  it('a STORED export is ALWAYS masked (raw PII never persisted), and a foreign tenant cannot download it', async () => {
    // Even though the live API can un-mask with pii:read, the stored artifact must never contain raw PII.
    const exp = await exportSvc.create(T1, { kind: 'calls' });
    const file = await exportSvc.download(T1, exp.id);
    expect(file.csv.includes(PHONE)).toBe(false); // masked in the file
    // RLS: T2 cannot download T1's export.
    await expect(exportSvc.download(T2, exp.id)).rejects.toSatisfy(
      (e) => isAppError(e) && e.code === 'NOT_FOUND',
    );
  });

  it('writes an audit row for each export', async () => {
    const audits = await db.admin.auditLog.findMany({
      where: { tenantId: T1, action: 'analytics.export' },
      select: { id: true },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Export schedules', () => {
  it('creates, toggles, and lists a schedule; a foreign tenant sees none', async () => {
    const s = await exportSvc.createSchedule(T1, { kind: 'calls', cadence: 'daily', active: true });
    expect(s.active).toBe(true);
    const off = await exportSvc.setScheduleActive(T1, s.id, false);
    expect(off.active).toBe(false);
    expect((await exportSvc.listSchedules(T1)).length).toBeGreaterThanOrEqual(1);
    expect(await exportSvc.listSchedules(T2)).toHaveLength(0);
  });
});

describe('Isolation (self-audit B)', () => {
  it('a tenant never sees another tenant’s calls or exportSvc', async () => {
    expect((await analytics.listCalls(T2, { limit: 100 }, { includePii: true })).rows).toHaveLength(
      0,
    );
    expect(await exportSvc.list(T2)).toHaveLength(0);
  });
});
