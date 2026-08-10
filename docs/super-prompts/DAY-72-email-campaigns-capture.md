# DAY 72 — Email as a Campaign Channel + Capture-Email-Mid-Call (with Consent)  ⚡ SONNET

**Tier:** 🟡 PHASE 3 ADD-ON

> ⏱️ **Sequencing:** Slots naturally with **Day 44 (messaging)** — extends blended campaigns to include email.

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Resend (Day 1) + a marketing-email sending domain (SPF/DKIM/DMARC configured).
- Day 18 (Listen/Capture node), Day 44 (messaging).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §4.4, §3.5
- DATA-MODEL.md (Contact, Campaign.channelMix)

## Objective
Make email a first-class outbound channel: cold/nurture email sequences blended into campaigns, plus an explicit 'capture email mid-call with consent → trigger email follow-up' flow so cold-call leads can opt into email.

## Step-by-step build
1. Email sending: marketing-grade send via Resend (separate from transactional); domain auth (SPF/DKIM/DMARC) checks; templates with variables + per-language.
2. Capture-email flow: agent asks for email (Listen node) + confirms (Collect&Confirm) + captures explicit consent to email; store consent + source on Contact.
3. Blended campaigns: extend channelMix so a sequence can be call → SMS/WhatsApp → email per outcome; deliverability + bounce/unsubscribe handling.
4. Compliance: only email contacts with a lawful basis (imported-with-consent or captured-with-consent); honour unsubscribe; never email scraped numbers.
5. Tests: send + template substitution, consent capture + gating (no consent = no email), blended sequence logic, unsubscribe/bounce handling, cost/metering.

## Definition of Done
- [ ] Email is a campaign channel; mid-call email capture with consent triggers follow-up; blended call+text+email sequences work; unsubscribe/consent enforced; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **C (consent/lawful-basis enforcement — critical, anti-spam) + B + A.**

## Commit plan
`feat(api,workers,voice): email campaigns + consented mid-call email capture (Day 72)` — branch `day/72-email-campaigns-capture` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Closes the 'how do we get the email' gap — email only sends with a lawful basis, which is both compliant and better for deliverability.
