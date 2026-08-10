-- Day 37: public lead-capture forms + submissions. Both tenant-scoped + RLS-protected.

CREATE TABLE "Form" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "routing" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormSubmission" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "contactId" UUID,
    "values" JSONB NOT NULL DEFAULT '{}',
    "synced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Form_tenantId_idx" ON "Form"("tenantId");
CREATE INDEX "FormSubmission_tenantId_idx" ON "FormSubmission"("tenantId");
CREATE INDEX "FormSubmission_tenantId_formId_idx" ON "FormSubmission"("tenantId", "formId");

ALTER TABLE "Form" ADD CONSTRAINT "Form_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: tenant isolation, same policy shape as every tenant table (Day 04).
ALTER TABLE "Form" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Form"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));

ALTER TABLE "FormSubmission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FormSubmission"
  USING (is_in_subtree("tenantId", current_tenant()))
  WITH CHECK (is_in_subtree("tenantId", current_tenant()));
