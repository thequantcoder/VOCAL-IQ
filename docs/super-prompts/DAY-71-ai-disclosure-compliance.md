# DAY 71 — AI Disclosure & 'Press 1 for Human' Compliance Toolkit  🧠 OPUS

**Tier:** 🔴 CORE-TIER (do early)

> ⏱️ **Sequencing:** **Do in Phase 2–3.** AI-disclosure laws are spreading (some regions now require telling callers they're speaking to AI). Build it as a platform feature so every tenant inherits it.

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 9 (loop), Day 60 (compliance track) ideally.
- Confirm target regions + their disclosure rules.

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §3.10, §5.2.5 (compliance)
- DATA-MODEL.md
- CODING-RULES.md (PII/compliance)

## Objective
Region-aware AI disclosure: configurable spoken disclosure at call start ('You're speaking with an AI assistant'), mandatory 'press 1 / say human to reach a person' opt-out, calling-hour + frequency rules (TCPA-style), and consent logging — all per-region, enforced platform-wide.

## Step-by-step build
1. Disclosure engine: per-region/per-agent spoken AI disclosure injected at call start; logged.
2. Human opt-out: always-available 'reach a human' path (DTMF/keyword) routing to Agent Desk or callback; cannot be disabled where law requires.
3. Calling-rules engine: region-aware allowed hours, frequency caps, holiday rules; block calls that violate.
4. Consent + disclosure audit: store what was disclosed + when, per call (defensible record).
5. Compliance template library: pre-built rule sets (TCPA, GDPR, regional calling hours).
6. Tests: disclosure injected per region, human opt-out always works, calling-hour enforcement, consent logging, template application.

## Definition of Done
- [ ] Region-aware AI disclosure + mandatory human opt-out enforced; calling-hour/frequency rules applied; consent/disclosure logged; template library; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **C (compliance correctness, opt-out cannot be bypassed) + B + A (region rules).**

## Commit plan
`feat(voice,api): AI disclosure + human opt-out + calling-rules compliance (Day 71)` — branch `day/71-ai-disclosure-compliance` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Legally defensible AI calling — increasingly mandatory and a real selling point for enterprise/regulated buyers.
