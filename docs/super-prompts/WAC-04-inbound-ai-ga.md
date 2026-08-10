# WAC 04 — Inbound AI answering GA + live-call view UI  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.
>
> 🚀 **This ships the headline feature:** a customer taps "Call" in WhatsApp → the tenant's AI agent answers instantly, in context, 24×7.

## Prerequisites (admin)
- WAC-00..03 merged. A number with **calling enabled** (`calling.status=ENABLED`) — test number for dev; a real (verified, ≥2,000-tier) number for production.

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `DESIGN-SYSTEM.md` — **§0 (waveform thesis), §4 (motion: cyan "speaking" pulse), §5c (the live-call view — waveform is the centrepiece), §7 (senior-FE floor)**.
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.3 (inbound), §A.6 (calling hours), §A.7 (cta/deeplink payloads → context), §D (context-aware answering)**.
- WAC-02 service + WAC-03 bridge; `apps/api/src/agents`, `apps/api/src/flows` (agent/flow selection); the existing live-call view + `apps/web/lib/api.ts` calls hooks; `packages/ui` (Card, Badge, Waveform/`AmbientBackground`, StatusDot).
- `apps/api/src/calls/calls-read.service.ts` + the dashboard Calls page (surface WhatsApp calls in the existing feed).

## Objective
Make inbound WhatsApp calls **production-real**: route the number → the right agent/flow/persona; carry **context** from the tapped button/deep-link so the agent opens knowing intent; respect **calling hours**; record/transcribe/analyse like any call; and give the operator a **beautiful live-call view + call detail** for WhatsApp calls.

## Step-by-step build

### Backend
1. **Number → agent routing** — resolve the inbound number's assigned agent/flow (reuse the PSTN inbound routing); pass `agentId`/`flowVersionId` into the WAC-03 control call so the correct brain answers.
2. **Context injection** — map `cta_payload` / `deeplink_payload` → flow variables (`intent`, `campaignId`, `orderId`, …) so the agent greets in context ("I see you're calling about order #A1234…"). Define a small, documented payload convention (JSON or `key:value`) generated in WAC-07.
3. **Calling-hours gate** — before accept, check the number's `call_hours`; outside hours (or agent saturated) → `reject` with a graceful path (deflect-to-chat / callback capture, wired fully in WAC-05/WAC-08). Respect timezone.
4. **Persist + analyse** — Call(channel=WHATSAPP) with transcript, recording, cost hook (WAC-06), sentiment/intel via the existing post-call workers. Surfaced in Calls/Analytics with a WhatsApp channel filter + icon.

### Frontend (make it lovely — DESIGN-SYSTEM §5c)
5. **Live-call view (WhatsApp)** — reuse/extend the signature **live waveform** view: the **cyan waveform pulses to live audio** as the AI/caller speak; a WhatsApp-green channel chip; caller identity (name/wa_id, avatar via `AgentAvatar`), the context payload shown as a small "why they're calling" callout, live streaming captions (transcript), talk/listen indicator, and a "take over" (Agent Desk) affordance. **Restraint rule §4:** waveform does the talking, everything else stays still. `prefers-reduced-motion` → a calm static level meter.
6. **Call detail (WhatsApp)** — in the existing Calls detail page, show channel=WhatsApp, direction, cta/deeplink context, duration, recording player, transcript, sentiment/QA — all reusing existing components; add a WhatsApp badge + the payload context block.
7. **Calls feed** — add a channel filter chip (All · PSTN · Web · **WhatsApp**) + a WhatsApp glyph on rows; no new page, just the channel woven in.

### Tests
8. Routing picks the number's agent; context payload → flow variables (unit); calling-hours gate rejects outside hours (timezone-correct); a WhatsApp call is recorded/transcribed/costed and appears in the feed filtered by channel; tenant isolation. Web: the live-call view renders the waveform + captions + context, reduced-motion fallback, loading/empty/error states.

## Definition of Done
- [ ] A real inbound WhatsApp call is answered by the **assigned agent in context**, respects calling hours, and is recorded/transcribed/analysed like any call.
- [ ] The **live-call view** shows the signature waveform pulsing to WhatsApp audio + live captions + caller/context; reduced-motion fallback; a11y labels.
- [ ] WhatsApp calls appear in the Calls feed/detail (channel filter + badge), reusing existing components.
- [ ] Tests pass (backend + web); typecheck/lint/build green.

## Self-audit focus
Full A–K. Special attention: **H (the live-call view is genuinely lovely + accessible + reduced-motion-safe — the waveform is the hero), B (tenant/number-scoped routing), A (context payload correctly reaches the agent; calling-hours timezone correct), F (no added latency vs PSTN).**

## Commit plan
`feat(api,web,voice): inbound WhatsApp AI answering GA + live-call view [wac-04]` — branch `wac/04-inbound-ai-ga` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
Inbound WhatsApp AI calling is LIVE — customers call on WhatsApp, the agent answers in context. Next: WAC-05 — call settings + AI voicemail.
