# VocalIQ — Go-Live Checklist (Day 66)

Run `GET /admin/launch/readiness` (super-admin) for the automated gate; this is the human sign-off
that backs it. **GO only when every blocker is ✅.**

## Blockers (must be green)
- [ ] **Billing live** — `STRIPE_SECRET_KEY` + webhook secret set; a live test charge + refund done.
- [ ] **Auth secret** — `APP_JWT_SECRET` set (≥32 random bytes), rotated from any dev value.
- [ ] **Key-vault master** — `VAULT_MASTER_KEY` set (32-byte base64); provider keys re-encrypted under it.
- [ ] **Compliance controls** — consent capture, DNC, retention, and PII redaction verified on.
- [ ] **Database** — reachable, migrations deployed, connection pool sized for target concurrency.
- [ ] **Backups + DR** — automated backups on; a **restore drill** completed; set `BACKUPS_VERIFIED=true`.

## Warnings (should be green)
- [ ] **CORS** — `CORS_ALLOWED_ORIGINS` set to the real dashboard origin(s).
- [ ] **Error monitoring** — `SENTRY_DSN` set; a test error visible in Sentry.
- [ ] **Status page + uptime** — `/status` public; external uptime monitors pointed at it.
- [ ] **Provider fallback** — key-pool has ≥2 keys per critical provider (LLM/STT/TTS).
- [ ] **Data region** — `DATA_REGION` pinned; storage/voice routed in-region.

## Final steps
- [ ] Load test passed at target concurrency (see `infra/load-test/`); autoscaling + cost verified.
- [ ] Chaos drills passed (provider outage fallback, region failover, queue backpressure).
- [ ] Runbooks reviewed (`docs/runbooks/`); on-call + alerts configured.
- [ ] Tag `v1.0`, announce, and enable live traffic gradually (canary → 100%).
