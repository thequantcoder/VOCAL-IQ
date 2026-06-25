# DAY 70 — Real-Time Fraud & Abuse Detection  🧠 OPUS

**Tier:** 🔴 CORE-TIER (do early)

> ⏱️ **Sequencing:** **Do in Phase 1–4.** Prevents your platform being used for spam/scam, protects your carrier relationships + reputation, and is required for trust at scale.

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Days 10-11 (calling), 13 (cost), 28 (campaigns).
- No new credentials (uses internal signals + Redis).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- CODING-RULES.md (abuse controls)
- ARCHITECTURE.md (security)
- DATA-MODEL.md (AuditLog)

## Objective
Detect and stop abusive usage in real time: anomaly detection on call patterns (volume spikes, repeated short calls, DNC violations, flagged content), velocity limits, automated suspension, and a fast per-tenant/per-number kill-switch.

## Step-by-step build
1. Signal collection: per-tenant call velocity, failure rates, complaint signals, DNC-hit rate, banned-content hits, geographic anomalies.
2. Anomaly detection: rules + scoring to flag suspicious tenants/campaigns/numbers; thresholds configurable.
3. Automated response: throttle, pause campaign, suspend tenant, or kill a number; require review to resume; notify super-admin.
4. KYC enforcement gate for high-volume tenants before scaling.
5. Abuse dashboard + audit trail of every action.
6. Tests: anomaly triggers, velocity caps, auto-suspend + resume flow, kill-switch latency, audit completeness.

## Definition of Done
- [ ] Abusive patterns detected + auto-throttled/suspended in real time; kill-switch works fast.
- [ ] KYC gate for high volume; abuse dashboard + full audit; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **C (the whole day) + B + G (alerting).**

## Commit plan
`feat(api,workers): real-time fraud & abuse detection (Day 70)` — branch `day/70-fraud-abuse-detection` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Platform protected from misuse — critical for carrier relationships and trust.
