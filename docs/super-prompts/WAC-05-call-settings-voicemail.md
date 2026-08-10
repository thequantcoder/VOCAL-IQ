# WAC 05 — Call settings (hours/icons/callback/codecs) + AI voicemail + settings UI  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- WAC-04 merged. Number with calling enabled.

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `DESIGN-SYSTEM.md` — §3 (layout/spacing), §4 (motion restraint), §7 (senior-FE floor), §8 (component standards).
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.6 (full `/settings` body: `call_hours`, `call_icon_visibility`, `call_icons.restrict_to_user_countries`, `callback_permission_status`, `audio.additional_codecs`, `voicemail`, `srtp_key_exchange_protocol`), §A.6 (voicemail→`messages` webhook, WACID-correlated), §D.5 (AI voicemail→lead)**.
- WAC-01 adapter `getSettings`/`updateSettings`; WAC-02 `onSettingsUpdate`; the existing intel/sentiment/lead workers; the Media API (`use_case=call_voicemail_announcement`); `packages/ui` (Switch, SegmentedControl, Select, TimeField/Input, Card, Callout, Toast).

## Objective
Let a tenant configure **when/how** their WhatsApp line takes calls — business hours (per timezone + holidays), call-button visibility + country limits, callback-permission auto-grant, codecs — through a **clean settings UI**; and turn **rejected/timeout calls into AI voicemail → structured leads**.

## Step-by-step build

### Backend
1. **Settings service** `apps/api/src/whatsapp-calling/whatsapp-call-settings.service.ts` — `getSettings`/`updateSettings` via the adapter; validate with a Zod schema mirroring §A.6 (≤2 hour-blocks/day, no overlap, valid IANA tz, ≤20 holidays, future dates, valid codecs). Persist a local mirror (for UI + calling-hours gate in WAC-04) and reconcile with `account_settings_update` webhooks.
2. **Voicemail** — upload the announcement (OGG/OPUS <60 s) via the Media API (`use_case=call_voicemail_announcement`); set `voicemail{status, triggers:[REJECT|TIMEOUT], audio.default{announcement_media_id, timeout_seconds}}`. Handle the **voicemail-delivery webhook** (inbound audio on `messages` where `messages[].id` = WACID): download the audio → **Deepgram STT → intel/sentiment/lead extraction** (existing workers) → create a structured Lead + an AI-drafted follow-up draft; link it to the (missed) Call by WACID.
3. **Routes** — `GET/PUT /whatsapp-calling/settings` + `POST /whatsapp-calling/voicemail/announcement` (config-writers, tenant-scoped).

### Frontend (settings that feel effortless — DESIGN-SYSTEM §8)
4. **A "WhatsApp Calling" settings section** (extends the WAC-07 panel or a `Settings → WhatsApp Calling` sub-page): 
   - **Calling hours** — a clean weekly-schedule editor (day rows, open/close time pickers, add up to 2 blocks/day), a timezone `Select`, and a holidays list (date + closed/open). Live "Open now / Closed" pill computed from the schedule. Empty = "Open 24×7".
   - **Call button visibility** — `SegmentedControl` (Show everywhere / Buttons only / Off) mapping to `DEFAULT`/`DISABLE_ALL`; a country-restrict multiselect (`restrict_to_user_countries`).
   - **Callback permission** — a `Switch` ("Auto-ask for callback permission when a user calls you") with a one-line explainer.
   - **Codecs** — advanced/collapsed: OPUS (locked, default) + optional G.711 toggle, with a "legacy PSTN interop only" hint.
   - **Voicemail** — enable `Switch`, triggers (reject/timeout), timeout slider (0–30 s), an announcement uploader (drag-drop OGG/OPUS, <60 s, with a player preview), and a "voicemails become leads automatically" callout.
   - Save with optimistic UI + `Toast`; validation inline; loading/empty/error states; reduced-motion-safe.

### Tests
5. Settings Zod validation (bad tz/overlap/too-many-holidays rejected); update round-trips + reconciles with the settings webhook; voicemail webhook → STT → Lead created + linked by WACID; calling-hours "open now" computation (timezone + holiday) correct; tenant-scoped. Web: schedule editor renders/validates, uploader accepts only valid audio, a11y + reduced-motion.

## Definition of Done
- [ ] Tenant configures calling hours (tz + holidays), button visibility + country limits, callback permission, codecs — via a clean, validated UI that reconciles with Meta.
- [ ] Rejected/timeout calls → AI voicemail → **structured Lead + follow-up draft**, linked to the call by WACID.
- [ ] Tests pass (backend + web); typecheck/lint/build green.

## Self-audit focus
Full A–K. Special attention: **H (the calling-hours + voicemail UI are genuinely pleasant + accessible), A (timezone/holiday math; voicemail→lead correctness), B (tenant-scoped settings), E (Meta settings errors surfaced clearly; announcement upload constraints enforced).**

## Commit plan
`feat(api,web): WhatsApp call settings + AI voicemail [wac-05]` — branch `wac/05-call-settings-voicemail` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
Calling hours, button controls, callback permission, and AI voicemail-to-lead are live. Next: WAC-06 — cost metering + wallet.
