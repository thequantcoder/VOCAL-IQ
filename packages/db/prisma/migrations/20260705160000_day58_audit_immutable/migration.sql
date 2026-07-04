-- Day 58 — AuditLog tamper-proofing: privileged-action records are APPEND-ONLY in content. A
-- trigger raises on any UPDATE, so an existing audit row can never be altered (self-audit C —
-- immutability of record). INSERTs are unaffected. DELETE is intentionally NOT blocked so that
-- retention windows + GDPR tenant erasure (AuditLog cascades from Tenant) still work; what must
-- never happen is silent tampering with a record's actor/action/target/meta/timestamp.
CREATE OR REPLACE FUNCTION vq_audit_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: UPDATE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vq_audit_no_update ON "AuditLog";
CREATE TRIGGER vq_audit_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION vq_audit_no_update();
