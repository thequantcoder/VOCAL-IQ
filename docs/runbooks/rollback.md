# Runbook — Rollback

1. **App code** — redeploy the previous green image tag (api/voice/workers); they are stateless.
2. **Database migration** — migrations are additive by policy. If a bad migration shipped, apply a
   forward-fix migration (never destructive down-migrations in prod). Restore from backup only as a
   last resort (see `data-deletion.md` for the restore procedure).
3. **Config/flags** — toggle the offending feature off via **Governance → Feature flags** (takes
   effect immediately, no deploy) before rolling code.
4. **Verify** — `/status` operational, error rate back to baseline, a synthetic test call succeeds.
