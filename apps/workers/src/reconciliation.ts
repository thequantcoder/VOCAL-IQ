import type { PrismaClient } from '@vocaliq/db';

/**
 * Cost reconciliation (Day 13, golden rule #4). Sweeps for the "no un-metered call"
 * invariant: a COMPLETED call that ran the agent MUST carry UsageRecords. Any that don't
 * indicate a metering leak — the worker alarms so it's caught + backfilled.
 *
 * The pure `runReconciliation` (alarm decision) is unit-tested; `createDbFindUnmetered`
 * is the production finder — one admin-scoped query across all tenants (workers
 * legitimately span tenants; the owner client is used only for this infra sweep).
 */

export interface UnmeteredCall {
  tenantId: string;
  callId: string;
}

export interface ReconciliationDeps {
  findUnmetered(from: Date, to: Date): Promise<UnmeteredCall[]>;
  alarm(summary: string, calls: UnmeteredCall[]): void | Promise<void>;
  log(message: string): void;
}

export async function runReconciliation(
  deps: ReconciliationDeps,
  window: { from: Date; to: Date },
): Promise<UnmeteredCall[]> {
  const unmetered = await deps.findUnmetered(window.from, window.to);
  if (unmetered.length > 0) {
    await deps.alarm(
      `Cost reconciliation: ${unmetered.length} un-metered COMPLETED call(s)`,
      unmetered,
    );
  } else {
    deps.log('Cost reconciliation: all COMPLETED calls metered ✓');
  }
  return unmetered;
}

/** Production finder — COMPLETED calls in the window with zero UsageRecords, all tenants. */
export function createDbFindUnmetered(admin: PrismaClient) {
  return async (from: Date, to: Date): Promise<UnmeteredCall[]> => {
    return admin.$queryRaw<UnmeteredCall[]>`
      SELECT c."tenantId"::text AS "tenantId", c.id::text AS "callId"
      FROM "Call" c
      WHERE c.status = 'COMPLETED'
        AND c."createdAt" >= ${from} AND c."createdAt" < ${to}
        AND NOT EXISTS (SELECT 1 FROM "UsageRecord" u WHERE u."callId" = c.id)`;
  };
}
