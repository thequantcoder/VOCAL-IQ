# DAY 60 — Compliance Track — Consent, DNC, Redaction, Retention, PCI-Safe Capture  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Legal/compliance decisions per region; Day 12 recording; Day 19 tools.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §3.10, §5.2.5
- DATA-MODEL.md
- CODING-RULES.md (PII)

## Objective
Platform compliance features enabling regulated verticals: consent capture + recording disclosure, DNC enforcement, PII detection + redaction, retention/auto-deletion policies, and PCI-safe payment capture (card data never in transcripts/recordings).

## Step-by-step build
1. Consent + disclosure: region-aware consent capture + recording disclosure flows; store consent. **Add cookie-consent banner + privacy policy + ToS pages** (region-aware; gates analytics/PostHog until consented).
2. DNC: global + per-tenant suppression enforced pre-call (extend Day 10).
3. PII detection + redaction in transcripts/recordings; configurable.
4. Retention policies: per-tenant retention + automatic deletion jobs (recordings, transcripts, memory).
5. PCI-safe payment capture: DTMF or secure-handoff capture keeping card data out of transcripts/recordings.
6. Tests: consent gating, DNC enforcement, redaction effectiveness, retention deletion, PCI capture excludes card data from stores.

## Definition of Done
- [ ] Consent/DNC/redaction/retention/PCI-safe capture all work; regulated-vertical ready; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **C (the whole day — PII, PCI, consent) + B + G.**

## Commit plan
`feat(api,voice,workers): compliance track (Day 60)` — branch `day/60-compliance-track` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Regulated verticals unlocked. (SOC2/HIPAA/PCI certification is a process via Vanta/Drata + auditor.) Next: on-prem/VPC + residency.
