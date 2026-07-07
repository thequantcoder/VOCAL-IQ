-- Day 87 — BI analytics exports: materialized CSV exports of a tenant's calls/usage, and schedules
-- that a worker runs each cadence. Both tenant-scoped via RLS.
CREATE TABLE "AnalyticsExport" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "kind"      TEXT NOT NULL,
  "format"    TEXT NOT NULL DEFAULT 'csv',
  "status"    TEXT NOT NULL DEFAULT 'ready',
  "rowCount"  INTEGER NOT NULL DEFAULT 0,
  "fromTs"    TIMESTAMP(3),
  "toTs"      TIMESTAMP(3),
  "content"   TEXT,
  "error"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsExport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AnalyticsExport_tenantId_idx" ON "AnalyticsExport"("tenantId");
CREATE INDEX "AnalyticsExport_tenantId_createdAt_idx" ON "AnalyticsExport"("tenantId", "createdAt");
ALTER TABLE "AnalyticsExport" ADD CONSTRAINT "AnalyticsExport_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExportSchedule" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"  UUID NOT NULL,
  "kind"      TEXT NOT NULL,
  "cadence"   TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExportSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ExportSchedule_tenantId_idx" ON "ExportSchedule"("tenantId");
CREATE INDEX "ExportSchedule_active_cadence_idx" ON "ExportSchedule"("active", "cadence");
ALTER TABLE "ExportSchedule" ADD CONSTRAINT "ExportSchedule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant-scoped. The scheduled-exports worker uses the admin client (spans tenants) but always
-- filters/writes by the schedule's own tenantId.
ALTER TABLE "AnalyticsExport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AnalyticsExport"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "ExportSchedule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ExportSchedule"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
