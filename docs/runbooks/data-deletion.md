# Runbook — Data Deletion & DR

- **GDPR erasure (a contact):** delete the contact + cascade (memory, consent) via the tenant tools;
  transcripts/recordings past retention are already auto-deleted by the retention sweep (Day 60).
- **Tenant offboarding:** suspend → export their data → delete the tenant (cascades all owned rows;
  audit logs are retained per policy).
- **Retention sweep:** `POST /compliance/retention/sweep` (or the scheduled worker) deletes
  transcripts/recordings/memory older than the tenant's window.
- **DR / restore drill:** restore the latest backup to a staging DB, run `prisma migrate deploy`,
  smoke-test auth + a call read; record the RTO/RPO. Set `BACKUPS_VERIFIED=true` after a successful drill.
