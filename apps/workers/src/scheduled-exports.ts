import type { PrismaClient } from '@vocaliq/db';
import {
  CALL_EXPORT_HEADERS,
  type ExportCadence,
  type GovernedCallRow,
  MAX_EXPORT_ROWS,
  USAGE_EXPORT_HEADERS,
  type UsageExportRow,
  callCells,
  isScheduleDue,
  maskPhone,
  toCsv,
  usageCells,
} from '@vocaliq/shared';

/**
 * Scheduled BI exports (Day 87). A repeatable tick finds active export schedules that are DUE
 * ({@link isScheduleDue}) and materializes a CSV of that tenant's calls/usage for the cadence window,
 * then stamps the schedule as run. Scheduled exports are ALWAYS PII-masked (a background job carries no
 * pii:read scope — governance, self-audit C). The tenant id is carried on every row the worker writes,
 * so a run never crosses tenants (self-audit B). Pure-ish: the loop + due decision are testable via
 * injected Deps; the DB Deps use the admin client (the worker legitimately spans tenants).
 */

export interface DueSchedule {
  id: string;
  tenantId: string;
  kind: string; // calls | usage
  cadence: ExportCadence;
  lastRunAt: Date | null;
}

export interface ScheduledExportDeps {
  listActiveSchedules(): Promise<DueSchedule[]>;
  generateExport(schedule: DueSchedule, now: Date): Promise<{ rowCount: number }>;
  markRan(scheduleId: string, now: Date): Promise<void>;
  log(message: string): void;
}

export interface ScheduledExportResult {
  considered: number;
  ran: number;
}

/** Run every DUE active schedule once. A failing schedule is logged + skipped (not marked run → retries). */
export async function runScheduledExports(
  deps: ScheduledExportDeps,
  now: Date,
): Promise<ScheduledExportResult> {
  const schedules = await deps.listActiveSchedules();
  let ran = 0;
  for (const s of schedules) {
    if (!isScheduleDue(s.cadence, s.lastRunAt, now)) continue;
    try {
      const { rowCount } = await deps.generateExport(s, now);
      await deps.markRan(s.id, now);
      ran += 1;
      deps.log(`export ${s.kind} for tenant ${s.tenantId}: ${rowCount} rows`);
    } catch (err) {
      deps.log(`export ${s.id} failed: ${(err as Error).message}`);
    }
  }
  return { considered: schedules.length, ran };
}

// ── Production wiring (admin client — spans tenants; every write carries tenantId) ──

const DAY_MS = 24 * 60 * 60 * 1000;

interface CallRow {
  id: string;
  agentId: string;
  phone: string | null;
  direction: string;
  status: string;
  disposition: string | null;
  sentiment: number | null;
  durationSec: number | null;
  costUsd: number;
  startedAt: Date | null;
  createdAt: Date;
}
interface UsageRow {
  day: string;
  provider: string;
  capability: string;
  costUsd: number;
  units: number;
}

export function createDbScheduledExportDeps(
  admin: PrismaClient,
  log: (msg: string) => void,
): ScheduledExportDeps {
  return {
    listActiveSchedules: async () => {
      const rows = await admin.exportSchedule.findMany({
        where: { active: true },
        select: { id: true, tenantId: true, kind: true, cadence: true, lastRunAt: true },
      });
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenantId,
        kind: r.kind,
        cadence: r.cadence as ExportCadence,
        lastRunAt: r.lastRunAt,
      }));
    },
    generateExport: async (schedule, now) => {
      const from = new Date(now.getTime() - (schedule.cadence === 'daily' ? DAY_MS : 7 * DAY_MS));
      let csv: string;
      let rowCount: number;
      if (schedule.kind === 'usage') {
        const rows = await admin.$queryRaw<UsageRow[]>`
          SELECT to_char(u."ts", 'YYYY-MM-DD') AS day, u.provider::text AS provider,
                 u.capability::text AS capability, sum(u."costUsd")::float AS "costUsd",
                 sum(u."units")::float AS units
          FROM "UsageRecord" u
          WHERE u."tenantId" = ${schedule.tenantId}::uuid AND u."ts" >= ${from} AND u."ts" < ${now}
          GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2`;
        const mapped: UsageExportRow[] = rows.map((r) => ({
          day: r.day,
          provider: r.provider,
          capability: r.capability,
          costUsd: Math.round((Number(r.costUsd) || 0) * 1e6) / 1e6,
          units: Number(r.units) || 0,
        }));
        csv = toCsv([...USAGE_EXPORT_HEADERS], mapped.map(usageCells));
        rowCount = mapped.length;
      } else {
        const rows = await admin.$queryRaw<CallRow[]>`
          SELECT c.id::text AS id, c."agentId"::text AS "agentId", ct."phone" AS phone,
                 c.direction::text AS direction, c.status::text AS status, c.disposition AS disposition,
                 c.sentiment AS sentiment, c."durationSec" AS "durationSec",
                 c."startedAt" AS "startedAt", c."createdAt" AS "createdAt",
                 COALESCE((SELECT sum(u."costUsd") FROM "UsageRecord" u WHERE u."callId" = c.id), 0)::float AS "costUsd"
          FROM "Call" c
          LEFT JOIN "Contact" ct ON ct.id = c."contactId" AND ct."tenantId" = ${schedule.tenantId}::uuid
          WHERE c."tenantId" = ${schedule.tenantId}::uuid AND c."createdAt" >= ${from} AND c."createdAt" < ${now}
          ORDER BY c."createdAt" DESC LIMIT ${MAX_EXPORT_ROWS}`;
        // Scheduled exports are ALWAYS masked (no pii:read for a background job).
        const mapped: GovernedCallRow[] = rows.map((r) => ({
          id: r.id,
          agentId: r.agentId,
          phone: maskPhone(r.phone ?? ''),
          direction: r.direction,
          status: r.status,
          disposition: r.disposition,
          sentiment: r.sentiment,
          durationSec: r.durationSec,
          costUsd: Math.round((Number(r.costUsd) || 0) * 1e6) / 1e6,
          startedAt: r.startedAt ? r.startedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        }));
        csv = toCsv([...CALL_EXPORT_HEADERS], mapped.map(callCells));
        rowCount = mapped.length;
      }
      await admin.analyticsExport.create({
        data: {
          tenantId: schedule.tenantId,
          kind: schedule.kind,
          format: 'csv',
          status: 'ready',
          rowCount,
          fromTs: from,
          toTs: now,
          content: csv,
        },
      });
      return { rowCount };
    },
    markRan: async (scheduleId, now) => {
      await admin.exportSchedule.update({ where: { id: scheduleId }, data: { lastRunAt: now } });
    },
    log,
  };
}
