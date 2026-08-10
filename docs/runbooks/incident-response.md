# Runbook — Incident Response

1. **Detect** — alert fires (Sentry error spike / uptime monitor red / SLO breach on `/dashboard/latency`).
2. **Triage** — check `/status` + super-admin **System health** (DB, workers, calls error rate).
3. **Declare severity** — SEV1 (calls failing platform-wide) / SEV2 (degraded) / SEV3 (minor).
4. **Mitigate** — apply the smallest fix: fail over a provider (eject the bad key in **Key pool**),
   scale voice/workers (HPA or manual), or roll back (see `rollback.md`).
5. **Communicate** — post to the status page; update stakeholders every 30 min on a SEV1.
6. **Resolve + review** — confirm metrics recovered; write a blameless post-mortem within 48h.
