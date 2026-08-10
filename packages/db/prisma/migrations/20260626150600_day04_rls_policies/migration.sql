-- Day 04 — Row-Level Security, reseller subtree, app role, hypertable, vector index.
-- RLS is the safety net; application-layer tenant filters are the front door.
--
-- IMPORTANT: the migration/seed/admin role (`vocaliq`, a superuser) BYPASSES RLS by
-- design — that is the audited privileged path. The runtime app connects as the
-- NON-superuser `vocaliq_app` role, which RLS actually constrains.

-- ── Tenant-context + subtree helpers ────────────────────────────────────────
-- Reads the per-connection tenant the API/voice set (CODE-PATTERNS §1). Empty/unset
-- → NULL, which makes every policy deny (no tenant context = no rows).
CREATE OR REPLACE FUNCTION current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
$$;

-- True when `child` is `ancestor` or a descendant of it (walks parentTenantId up).
-- SECURITY DEFINER + owned by the superuser migration role so it reads the full
-- Tenant tree regardless of the caller's RLS. A reseller thus sees its descendants
-- but never a sibling reseller's subtree.
CREATE OR REPLACE FUNCTION is_in_subtree(child uuid, ancestor uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH RECURSIVE up AS (
    SELECT id, "parentTenantId" FROM "Tenant" WHERE id = child
    UNION ALL
    SELECT t.id, t."parentTenantId" FROM "Tenant" t JOIN up ON t.id = up."parentTenantId"
  )
  SELECT ancestor IS NOT NULL AND child IS NOT NULL
         AND EXISTS (SELECT 1 FROM up WHERE up.id = ancestor)
$$;

-- ── Runtime application role (RLS-constrained; never a superuser) ────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vocaliq_app') THEN
    -- Dev-only local credential (same posture as the docker `vocaliq` password).
    CREATE ROLE vocaliq_app LOGIN PASSWORD 'vocaliq_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO vocaliq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vocaliq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vocaliq_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vocaliq_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO vocaliq_app;

-- ── Timescale hypertable + pgvector index ───────────────────────────────────
-- UsageRecord PK is (id, ts) so `ts` (the partition column) is included — required.
SELECT create_hypertable('"UsageRecord"', 'ts', if_not_exists => TRUE, migrate_data => TRUE);
CREATE INDEX IF NOT EXISTS "KbChunk_embedding_hnsw"
  ON "KbChunk" USING hnsw (embedding vector_cosine_ops);

-- ── Row-Level Security policies ─────────────────────────────────────────────
-- Standard tenant tables: visible/writable only within the caller's subtree.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Membership','Agent','Flow','FlowVersion','KnowledgeBase','KbChunk','AgentMemory',
    'Contact','Lead','SipTrunk','Call','Transcript','Campaign','CampaignContact',
    'Appointment','Subscription','Wallet','UsageRecord','Invoice','Integration',
    'Webhook','SupportTicket','Notification','AuditLog'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (is_in_subtree("tenantId", current_tenant())) WITH CHECK (is_in_subtree("tenantId", current_tenant()));',
      t);
  END LOOP;

  -- Tables where a NULL tenantId means a platform preset/global row visible to all
  -- (public voices, global plans, pooled numbers, global/plan feature flags).
  FOREACH t IN ARRAY ARRAY['Voice','Plan','PhoneNumber','FeatureFlag']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" IS NULL OR is_in_subtree("tenantId", current_tenant())) WITH CHECK ("tenantId" IS NULL OR is_in_subtree("tenantId", current_tenant()));',
      t);
  END LOOP;
END $$;

-- ProviderCredential: stricter — platform (NULL) keys are NOT exposed to tenants;
-- they are reached only via the privileged superuser path.
ALTER TABLE "ProviderCredential" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProviderCredential"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

-- Tenant itself: a caller sees its own node and descendants.
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tenant"
  USING (is_in_subtree(id, current_tenant()))
  WITH CHECK (is_in_subtree(id, current_tenant()));

-- ResellerMargin: a reseller sees margin rows for itself or any descendant on
-- either side of the relationship.
ALTER TABLE "ResellerMargin" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ResellerMargin"
  USING (is_in_subtree("resellerTenantId", current_tenant()) OR is_in_subtree("childTenantId", current_tenant()))
  WITH CHECK (is_in_subtree("resellerTenantId", current_tenant()));
