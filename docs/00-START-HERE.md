# 00 — START HERE

Welcome. This kit turns the **VocalIQ v1.2 blueprint** into a buildable, day-by-day program for Claude Code (Opus + Sonnet). Read this once, then never skip the daily loop.

---

## What you (the admin) do once, before Day 0

1. **Open this folder in VS Code** with the Claude Code extension installed.
2. **Read `PREREQUISITES.md`** and start creating the accounts in the "Phase 0–1" group. You don't need everything on day one — the file tells you what's needed *when*.
3. **Have ready for Day 0:**
   - Your **GitHub account access** so Claude Code can push to the repo: `https://github.com/thequantcoder/VOCAL-IQ` (create it as an empty private repo; authenticate `git`/GitHub CLI on your Mac).
   - The code will be saved in: `/Users/saransh/Documents/VOCAL-IQ` (already wired into the kit — Claude uses it directly).
   - A **password manager / secrets place** to keep API keys.
4. **Start Day 0.** The path and repo are already in `CLAUDE.md §0.1` — just run the Day 0 prompt; Claude scaffolds at `/Users/saransh/Documents/VOCAL-IQ`, initialises git, and pushes to your repo. After every change it auto-commits + pushes.

---

## What Claude does every day

The daily loop is defined in `CLAUDE.md §2`. In short: read the day file → confirm prerequisites → restate the plan → build with tests → run all checks → **self-audit** → **commit & push** → update `BUILD-LOG.md` → report back with commit hashes and any new admin actions.

---

## How to run a day

In Claude Code, paste or reference the day file, for example:

```
Read CLAUDE.md, then execute super-prompts/DAY-07-provider-router-core.md.
Follow the daily loop. Stop and ask if any prerequisite is missing.
```

Claude will load the context files the day lists, build, test, self-audit, and push.

---

## Model selection (Opus vs Sonnet)

Each day file header says `🧠 OPUS` or `⚡ SONNET`. Switch the Claude Code model accordingly. Opus for hard/architectural/security/voice/billing days; Sonnet for CRUD, UI, tests, config. See `CLAUDE.md §8`.

---

## The phases at a glance (full list in `PROMPT-INDEX.md`)

- **Phase 0 — Foundations** (Days 0–6): monorepo, CI/CD, tenancy, auth, RBAC, provider-router skeleton, one proven AI call.
- **Phase 1 — Core calling MVP** (Days 7–16): real-time loop, inbound/outbound, recording/transcription, first dashboard, billing + metering.
- **Phase 2 — Builder & conversations** (Days 17–30): React Flow builder, multilingual/multi-voice, RAG, tools, campaigns, lead workspace, Squads.
- **Phase 2.5 — Lead intel, testing, telephony** (Days 31–40): post-call intelligence, testing/QA suite, Agent Memory, BYO-SIP, appointments, cost protection.
- **Phase 3 — Analytics, multi-channel, polish** (Days 41–50): analytics, transcript search, QA scoring, messaging, ops toolkit, advanced intelligence, marketplace, API/SDK, motion polish.
- **Phase 4 — White-label & reseller** (Days 51–58): reseller hierarchy, custom domains, markup/wallet engine, super-admin control plane, plan builder, key vault.
- **Phase 5 — Scale & enterprise** (Days 59–66): SSO/SAML, compliance track, on-prem/VPC, data residency, scale infra, mobile, speech-to-speech.
- **Cross-cutting** (Days 67–68): Agent Desk (human transfer surface — do ~Day 27) and UI i18n/localization (foundation ~Day 1).
- **Core-tier additions** (Days 69–72, 🔴 do early): caller reputation/STIR-SHAKEN, fraud/abuse detection, AI-disclosure compliance, email campaigns. These protect the business — slot into Phases 1–4, not the end.
- **Phase 6 — Advanced** (Days 73–94, 🟣 after launch): sentiment-triggered actions, AI whisper/copilot, conversation intelligence, custom voices/models, emotion-aware voice, pay-by-voice, dialer modes, callbacks, revenue attribution, outcome billing, template + developer marketplaces, workflow automation, benchmarking, analytics API, real-time translation, learn-from-top-reps, voice biometrics, video avatars, and more channels (Telegram/Messenger/IG/RCS). Pick the subset that fits your market.

> **Launch path:** Phases 0–5 + Agent Desk + the 🔴 core-tier days = a sellable v1.0. Add Phase 6 as the advanced tier afterward — don't delay first revenue for the wow-features. See `PROMPT-INDEX.md`.

Each day is sized to be completable in one focused Claude Code session. Some heavy days (voice loop, billing, reseller engine) may span two sessions — that's fine; the day file notes it.

---

## Ground truth

- Product spec: `VocalIQ-Voice-AI-SaaS-Blueprint-v1.2.docx` (the full plan).
- How to build: `CLAUDE.md` + the rule files.
- What to build each day: `super-prompts/`.

If anything here conflicts with the blueprint on *features*, the blueprint wins. If anything conflicts on *how to build*, `CLAUDE.md` wins.

Now open `PREREQUISITES.md`, then `PROMPT-INDEX.md`, then begin `super-prompts/DAY-00-*.md`.
