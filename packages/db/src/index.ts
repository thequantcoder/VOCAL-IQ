import { PrismaClient } from '@prisma/client';

/**
 * @vocaliq/db — the multi-tenant Prisma client + tenant-scoping helpers.
 *
 * Two connection identities (DATA-MODEL §RLS):
 *  - the RUNTIME client connects as the non-superuser `vocaliq_app` role
 *    (`APP_DATABASE_URL`) so Row-Level Security actually constrains it;
 *  - migrations / seed / audited super-admin paths use the owner role
 *    (`DATABASE_URL`) which bypasses RLS by design.
 */

export * from '@prisma/client';

/** UUID branding is overkill here; tenant ids are plain strings end-to-end. */
export type TenantId = string;

function appDatabaseUrl(): string | undefined {
  return process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
}

/** Build a PrismaClient bound to a specific connection URL. */
export function createPrismaClient(url = appDatabaseUrl()): PrismaClient {
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

/**
 * Process-wide runtime client (RLS-constrained app role). Reused across requests;
 * tenant scoping is applied per-call via `withTenant`, never by swapping clients.
 */
export const prisma: PrismaClient =
  (globalThis as { __vocaliqPrisma?: PrismaClient }).__vocaliqPrisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') {
  (globalThis as { __vocaliqPrisma?: PrismaClient }).__vocaliqPrisma = prisma;
}

/** A transaction client (the subset of PrismaClient available inside $transaction). */
export type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Run `fn` with the tenant context set for the duration of ONE transaction, so RLS
 * policies (which read `app.current_tenant`) scope every query to that tenant
 * (CODE-PATTERNS §1). `set_config(..., true)` is transaction-local, so the value
 * never leaks across pooled connections.
 *
 * This is the ONLY sanctioned way the app touches tenant data — the front-door
 * filter complements the RLS safety net.
 */
export function withTenant<T>(
  tenantId: TenantId,
  fn: (tx: TxClient) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return fn(tx);
  });
}
