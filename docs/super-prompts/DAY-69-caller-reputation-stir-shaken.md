# DAY 69 — Caller Reputation, Branded Caller ID & STIR/SHAKEN  🧠 OPUS

**Tier:** 🔴 CORE-TIER (do early)

> ⏱️ **Sequencing:** **EXISTENTIAL — do this in Phase 1–2, before serious outbound volume.** If carriers flag your numbers 'Scam Likely', answer rates collapse and the whole model breaks.

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Telephony provider supporting STIR/SHAKEN attestation (Twilio/Telnyx).
- Branded Caller ID / CNAM registration (provider-specific; may need business verification).
- A number-reputation monitoring service or provider API.

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §13 (risks)
- DATA-MODEL.md (PhoneNumber)
- ARCHITECTURE.md (telephony)

## Objective
Protect answer rates: register numbers for STIR/SHAKEN attestation, set branded caller ID (CNAM/business name + logo where supported), monitor each number's spam-label reputation, and auto-rotate or rest numbers that get flagged.

## Step-by-step build
1. STIR/SHAKEN: ensure outbound calls carry proper attestation via the provider; store attestation level per call.
2. Branded caller ID: register business name/logo (CNAM / RCD) per number where the carrier supports it; per-tenant branded display.
3. Reputation monitoring: poll provider/3rd-party spam-label status per number; store a reputation score + history.
4. Auto-remediation: rotate/rest flagged numbers, throttle suspicious patterns, alert the operator; per-tenant number health dashboard.
5. Number warmup: gradual volume ramp on new numbers to build reputation.
6. Tests: attestation present on outbound, reputation polling + scoring, auto-rotation trigger on flag, warmup pacing, tenant scoping.

## Definition of Done
- [ ] Outbound calls carry STIR/SHAKEN attestation; branded caller ID set where supported.
- [ ] Per-number reputation monitored + scored; flagged numbers auto-rotated/rested; operator alerted.
- [ ] Number warmup pacing works; health dashboard per tenant; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **C (no spoofing/abuse — attestation is legitimate), B (per-tenant number health), F (rotation under volume), A (reputation logic).**

## Commit plan
`feat(voice,api): caller reputation, branded caller ID, STIR/SHAKEN (Day 69)` — branch `day/69-caller-reputation-stir-shaken` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Answer rates protected — this is what keeps the business viable at scale. Strongly recommend slotting this into Phase 1–2.
