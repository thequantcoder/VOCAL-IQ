# DAY 78 — Payment Collection Over the Phone (PCI-Safe Pay-by-Voice)  🧠 OPUS

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- A PCI-compliant payment-capture provider (e.g. Stripe + secure DTMF capture partner); Day 60 (PCI-safe capture).
- Confirm PCI scope/responsibility with admin.

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §5.2.5 (PCI-safe capture)
- CODING-RULES.md (PII/PCI)
- DATA-MODEL.md

## Objective
Let agents take payments on a call without card data ever touching transcripts/recordings: secure DTMF or tokenised capture, PCI-compliant, with receipts — for collections, bookings, orders.

## Step-by-step build
1. Secure capture: DTMF/tokenised card entry routed to a PCI-compliant processor; pause recording/redact during capture so card data never enters stores.
2. Payment flow node in the builder: amount, currency, confirm, receipt (email/SMS).
3. Refund/partial handling; reconciliation with billing.
4. Tests: card data excluded from transcript/recording (assert), successful charge + receipt, failure handling, PCI scope respected.

## Definition of Done
- [ ] Agents take payments by phone with zero card data in transcripts/recordings; receipts sent; tests prove PCI-safety; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **C (PCI — the entire point; card data never stored/logged) + D + B.**

## Commit plan
`feat(voice,api): PCI-safe pay-by-voice (Day 78)` — branch `day/78-pay-by-voice` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Unlocks collections, order-taking, and paid bookings — high-value, but confirm PCI responsibility model first.
