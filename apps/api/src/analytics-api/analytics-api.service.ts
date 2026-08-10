import { type AnalyticsQuery, maskPhone } from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';

/** Split a `<createdAt ISO>|<id>` keyset cursor. A legacy timestamp-only cursor yields a null id. */
function splitCursor(cursor: string): [string | null, string | null] {
  const i = cursor.indexOf('|');
  if (i < 0) return [cursor, null];
  return [cursor.slice(0, i), cursor.slice(i + 1)];
}

/**
 * Voice analytics READ API (Day 87) — powers the enterprise BI surface (`/v1/analytics/*`) + exports.
 * Every read is RLS-scoped to the caller's tenant (`db.withTenant`), filtered + keyset-paginated, and
 * PII (the contact phone) is MASKED unless the caller holds the `pii:read` scope (governance, self-audit
 * C). Shared with the export generator so the API and exports return the exact same governed rows.
 */

export interface CallAnalyticsRow {
  id: string;
  agentId: string;
  phone: string; // masked unless includePii
  direction: string;
  status: string;
  disposition: string | null;
  sentiment: number | null;
  durationSec: number | null;
  costUsd: number;
  startedAt: string | null;
  createdAt: string;
}

interface CallSqlRow {
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

export interface CallAnalyticsPage {
  rows: CallAnalyticsRow[];
  /** Keyset cursor (last row's createdAt ISO) — pass back as `?cursor=` for the next page. */
  nextCursor: string | null;
}

interface UsageSqlRow {
  day: string;
  provider: string;
  capability: string;
  costUsd: number;
  units: number;
}
export interface UsageAnalyticsRow {
  day: string;
  provider: string;
  capability: string;
  costUsd: number;
  units: number;
}

export class AnalyticsApiService {
  constructor(private readonly db: PrismaService) {}

  /**
   * Paginated, filtered call analytics. `includePii` (the `pii:read` scope) un-masks the contact phone;
   * without it the phone is masked. Keyset-paginated on `createdAt` (descending).
   */
  async listCalls(
    tenantId: string,
    query: AnalyticsQuery,
    opts: { includePii: boolean },
  ): Promise<CallAnalyticsPage> {
    const from = query.from ?? null;
    const to = query.to ?? null;
    const agentId = query.agentId ?? null;
    const status = query.status ?? null;
    const disposition = query.disposition ?? null;
    const limit = query.limit;
    // Composite keyset cursor `<createdAt ISO>|<id>` — ordering + the cursor include the row id so rows
    // sharing a millisecond timestamp are never skipped or duplicated across pages (a real BI concern).
    const [curTsRaw, curId] = query.cursor ? splitCursor(query.cursor) : [null, null];
    const curTs =
      curTsRaw && !Number.isNaN(new Date(curTsRaw).getTime()) ? new Date(curTsRaw) : null;
    const cursorId = curTs ? (curId ?? '') : null;

    const rows = await this.db.withTenant(
      tenantId,
      (tx) =>
        tx.$queryRaw<CallSqlRow[]>`
        SELECT c.id::text AS id, c."agentId"::text AS "agentId", ct."phone" AS phone,
               c.direction::text AS direction, c.status::text AS status, c.disposition AS disposition,
               c.sentiment AS sentiment, c."durationSec" AS "durationSec",
               c."startedAt" AS "startedAt", c."createdAt" AS "createdAt",
               COALESCE((SELECT sum(u."costUsd") FROM "UsageRecord" u WHERE u."callId" = c.id), 0)::float AS "costUsd"
        FROM "Call" c
        LEFT JOIN "Contact" ct ON ct.id = c."contactId"
        WHERE (${from}::timestamptz IS NULL OR c."createdAt" >= ${from})
          AND (${to}::timestamptz IS NULL OR c."createdAt" < ${to})
          AND (${agentId}::uuid IS NULL OR c."agentId" = ${agentId}::uuid)
          AND (${status}::text IS NULL OR c.status::text = ${status})
          AND (${disposition}::text IS NULL OR c.disposition = ${disposition})
          AND (${curTs}::timestamptz IS NULL
               OR (c."createdAt", c.id) < (${curTs}::timestamptz, ${cursorId}::uuid))
        ORDER BY c."createdAt" DESC, c.id DESC
        LIMIT ${limit}`,
    );

    const mapped: CallAnalyticsRow[] = rows.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      phone: opts.includePii ? (r.phone ?? '') : maskPhone(r.phone ?? ''),
      direction: r.direction,
      status: r.status,
      disposition: r.disposition,
      sentiment: r.sentiment,
      durationSec: r.durationSec,
      costUsd: Math.round((Number(r.costUsd) || 0) * 1e6) / 1e6,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
    const last = mapped[mapped.length - 1];
    return {
      rows: mapped,
      nextCursor: mapped.length === limit && last ? `${last.createdAt}|${last.id}` : null,
    };
  }

  /** Usage + cost aggregates by day / provider / capability over a window (RLS-scoped). */
  async usage(tenantId: string, window: { from?: Date; to?: Date }): Promise<UsageAnalyticsRow[]> {
    const to = window.to ?? new Date();
    const from = window.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const rows = await this.db.withTenant(
      tenantId,
      (tx) =>
        tx.$queryRaw<UsageSqlRow[]>`
        SELECT to_char("ts", 'YYYY-MM-DD') AS day, provider::text AS provider,
               capability::text AS capability,
               sum("costUsd")::float AS "costUsd", sum("units")::float AS units
        FROM "UsageRecord"
        WHERE "ts" >= ${from} AND "ts" < ${to}
        GROUP BY 1, 2, 3
        ORDER BY 1 DESC, 2`,
    );
    return rows.map((r) => ({
      day: r.day,
      provider: r.provider,
      capability: r.capability,
      costUsd: Math.round((Number(r.costUsd) || 0) * 1e6) / 1e6,
      units: Number(r.units) || 0,
    }));
  }
}
