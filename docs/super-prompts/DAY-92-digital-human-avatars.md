# DAY 92 — Digital Human / Video Avatar Agents  🧠 OPUS  ·  *(may take 2 sessions)*

**Tier:** 🟣 PHASE 6 — ADVANCED

> Execute via the daily loop in `CLAUDE.md §2`: read fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- A real-time avatar/video provider (e.g. HeyGen/D-ID/Tavus-class) + their API keys.
- Day 9 (loop), Day 16 (web/WebRTC), Day 45 (multimodal).

> If any credential/decision is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. See `PREREQUISITES.md` (Group F covers Phase 6 keys).

## Context to load
- CLAUDE.md
- Blueprint §3.2, §5
- ARCHITECTURE.md (realtime)
- DATA-MODEL.md

## Objective
Add video avatar agents: a photoreal/animated digital human that speaks the agent's responses on video calls + web widget — for reception, kiosks, premium support, and demos.

## Step-by-step build
1. Integrate a real-time avatar provider behind a router-style abstraction; lip-sync to TTS; fallback to voice-only.
2. Video web widget + video call channel (WebRTC); avatar selection per agent (extends voice config).
3. Latency + cost controls (video is expensive — gate by plan; auto-fallback).
4. Tests: avatar render + lip-sync smoke, video channel lifecycle, fallback, cost metering, tenant scoping.

## Definition of Done
- [ ] Video avatar agents work on web/video with lip-synced speech + voice fallback; cost-gated; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (A–K). Special attention to: **F (video latency) + D (video cost — high) + B + C (consent for likeness).**

## Commit plan
`feat(voice,web): digital human / video avatar agents (Day 92)` — branch `day/92-digital-human-avatars` → PR → CI green → merge to `main`.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
High 'wow' factor for demos/premium/kiosk use — but expensive; gate behind higher plans.
