import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { type PrismaClient, type TxClient, createPrismaClient, withTenant } from '@vocaliq/db';

/**
 * Two database identities (DATA-MODEL §RLS):
 *  - `app`  — the RLS-constrained runtime client. ALL tenant data goes through
 *             `withTenant()` so Row-Level Security scopes every query.
 *  - `admin`— the owner client used ONLY for auth-infra that legitimately spans
 *             tenants (lazy user sync + resolving which tenants a user belongs to).
 *             It bypasses RLS, so it is never used for business reads/writes.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  // Built at construction so the connection URLs are read after env is loaded.
  readonly app: PrismaClient = createPrismaClient(
    process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
  );
  readonly admin: PrismaClient = createPrismaClient(process.env.DATABASE_URL);

  /** Run `fn` with RLS scoped to `tenantId` (transaction-local app.current_tenant). */
  withTenant<T>(tenantId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return withTenant(tenantId, fn, this.app);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.app.$disconnect(), this.admin.$disconnect()]);
  }
}
