import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from './index';

loadDotenv({ path: resolve(process.cwd(), '../../.env') });

/**
 * Schema-shape guarantees (golden rule #1). Introspects the live DB (owner role)
 * to assert that EVERY tenant-owned table has `tenantId` + an index on it + RLS
 * enabled. Catches a future model that forgets the tenancy contract.
 */
const owner = createPrismaClient(process.env.DATABASE_URL);

afterAll(async () => {
  await owner.$disconnect();
});

// Platform/global tables that legitimately have no tenantId.
const NON_TENANT_TABLES = new Set(['User', 'PlatformApiKeyPool', '_prisma_migrations']);

interface Row {
  table_name: string;
}

describe('multi-tenant schema contract', () => {
  it('every tenant-owned table has RLS enabled', async () => {
    const tables = await owner.$queryRawUnsafe<Row[]>(`
      SELECT c.relname AS table_name
      FROM information_schema.columns col
      JOIN pg_class c ON c.relname = col.table_name AND c.relkind = 'r'
      WHERE col.table_schema = 'public' AND col.column_name = 'tenantId'
        AND NOT c.relrowsecurity
    `);
    const offenders = tables.map((t) => t.table_name).filter((t) => !NON_TENANT_TABLES.has(t));
    expect(offenders, `tables with tenantId but no RLS: ${offenders.join(', ')}`).toEqual([]);
  });

  it('every tenant-owned table has an index on tenantId', async () => {
    const missing = await owner.$queryRawUnsafe<Row[]>(`
      SELECT col.table_name
      FROM information_schema.columns col
      WHERE col.table_schema = 'public' AND col.column_name = 'tenantId'
        AND NOT EXISTS (
          SELECT 1 FROM pg_indexes i
          WHERE i.schemaname = 'public' AND i.tablename = col.table_name
            AND i.indexdef LIKE '%"tenantId"%'
        )
    `);
    const offenders = missing.map((t) => t.table_name).filter((t) => !NON_TENANT_TABLES.has(t));
    expect(offenders, `tables missing a tenantId index: ${offenders.join(', ')}`).toEqual([]);
  });

  it('required extensions are installed', async () => {
    const rows = await owner.$queryRawUnsafe<{ extname: string }[]>(
      `SELECT extname FROM pg_extension WHERE extname IN ('vector','timescaledb')`,
    );
    expect(rows.map((r) => r.extname).sort()).toEqual(['timescaledb', 'vector']);
  });
});
