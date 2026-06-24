# DAY 93 — Additional Channels — Telegram, Messenger, Instagram DM, RCS  ⚡ SONNET

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Channel API access: Telegram Bot API, Meta (Messenger/Instagram) Business, RCS via provider.
- Day 44 (messaging abstraction), Day 45 (multimodal).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §4.4
- DATA-MODEL.md (Campaign.channelMix)

## Objective
Extend the messaging abstraction to Telegram, Facebook Messenger, Instagram DM, and RCS so the same agent serves customers on more channels, all blended into campaigns.

## Step-by-step build
1. Add adapters (behind the Day 44 messaging abstraction) for Telegram, Messenger, Instagram DM, RCS; webhook verification each.
2. Same-agent multimodal handling across new channels; per-channel templates + opt-out.
3. Blend into campaigns (channelMix) + cost metering per channel.
4. Tests: per-channel send/receive, webhook verification, multimodal consistency, opt-out, tenant scoping.

## Definition of Done
- [ ] Agents serve Telegram/Messenger/Instagram/RCS via the same runtime, blended into campaigns; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **C (webhook verify, opt-out per channel) + B + D.**

## Commit plan
`feat(api,workers): Telegram/Messenger/Instagram/RCS channels (Day 93)` — branch `day/93-telegram-messenger-rcs` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
Meets customers on every messaging surface — broadens reach with low marginal effort on the existing abstraction.
