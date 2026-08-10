-- Day 88 — Real-time translation: dual-language transcripts + a deduped utterance→translation cache.
-- Both tenant-scoped via RLS. The cache dedupes identical text per target language (cost + latency).
CREATE TABLE "TranscriptTranslation" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"   UUID NOT NULL,
  "callId"     UUID NOT NULL,
  "targetLang" TEXT NOT NULL,
  "segments"   JSONB NOT NULL DEFAULT '[]',
  "summary"    TEXT,
  "model"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranscriptTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TranscriptTranslation_callId_targetLang_key" ON "TranscriptTranslation"("callId", "targetLang");
CREATE INDEX "TranscriptTranslation_tenantId_idx" ON "TranscriptTranslation"("tenantId");
ALTER TABLE "TranscriptTranslation" ADD CONSTRAINT "TranscriptTranslation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TranslationCache" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"   UUID NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "sourceLang" TEXT NOT NULL DEFAULT 'auto',
  "targetLang" TEXT NOT NULL,
  "text"       TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TranslationCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TranslationCache_tenantId_sourceHash_sourceLang_targetLang_key" ON "TranslationCache"("tenantId", "sourceHash", "sourceLang", "targetLang");
CREATE INDEX "TranslationCache_tenantId_idx" ON "TranslationCache"("tenantId");
ALTER TABLE "TranslationCache" ADD CONSTRAINT "TranslationCache_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: tenant-scoped.
ALTER TABLE "TranscriptTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TranscriptTranslation"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
ALTER TABLE "TranslationCache" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TranslationCache"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
