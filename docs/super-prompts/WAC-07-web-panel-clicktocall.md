# WAC 07 — WhatsApp Calling dashboard panel + click-to-call / call-button generator  ⚡ SONNET

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.
>
> 🎨 **The showpiece UI day.** This is the tenant's home for WhatsApp Calling — it must be *lovely*, obvious, and first-value-fast (DESIGN-SYSTEM §5 + §6).

## Prerequisites (admin)
- WAC-04..06 merged.

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `DESIGN-SYSTEM.md` — **§0 (waveform thesis), §5 (hero surfaces), §6 (onboarding/first-value-fast + `Stepper`), §7 (senior-FE floor), §8 (component standards)**.
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.7 (call buttons + deep links, `cta_payload`/`deeplink_payload`, `wa.me/call/<num>?biz_payload=`, `voice_call` interactive + template), §D (context-aware answering)**.
- `apps/web/app/dashboard/integrations/page.tsx` (Slack/CRM panel style to match), the WAC-05 settings section, `apps/web/lib/api.ts`; `packages/ui` (Card, Tabs, Stepper, SegmentedControl, Switch, Input, CopyButton, Callout, Badge, EmptyState, Toast, StatCard).
- WAC-01 adapter (send `voice_call` interactive/template + create template); the existing `messaging` sender.

## Objective
Ship the **WhatsApp Calling dashboard** (`/dashboard/whatsapp-calling`): a status/setup hero, enable/settings entry, live/recent WhatsApp calls + cost tiles, and a **click-to-call / call-button generator** — a delightful tool that produces a `wa.me/call` deep link, a QR, a website snippet, and a sendable `voice_call` WhatsApp button/template, each with a **context payload** that the AI agent uses to answer smartly.

## Step-by-step build (frontend-led; small API glue)

### The panel `/dashboard/whatsapp-calling`
1. **Setup hero + status** — if calling isn't enabled/verified, a **`Stepper`** onboarding (connect number → enable calling → set hours → try a test call) with a Live/Demo badge (gated pattern). If enabled, a calm hero with the **signature waveform** motif at rest, a "Calls today / answered / avg duration / cost" `StatCard` row, and an "Enabled ✓ / hours: open now" status pill.
2. **Recent WhatsApp calls** — a compact list (reuse the Calls feed row) filtered to channel=WhatsApp, each linking to the call detail (WAC-04); a "view all" to the Calls page.
3. **Settings entry** — link/inline the WAC-05 calling-hours + voicemail + visibility controls (or embed a summary with an "Edit" affordance).

### The click-to-call / call-button generator (the star)
4. **A tabbed generator** (`Tabs`: Deep link · QR · Website button · WhatsApp message button · Template):
   - **Context builder** (shared across tabs) — friendly fields (Intent, Campaign, Reference/Order id, free key:value) → composes the **payload** (documented convention from WAC-04) shown live; a "the agent will greet with this context" preview.
   - **Deep link** — `wa.me/call/<BUSINESS_NUMBER>?biz_payload=<payload>` with a live `CopyButton`; note "not on desktop".
   - **QR** — render a QR of the deep link (client-side, no new heavy dep if a light generator exists; else a documented small one) + download PNG/SVG.
   - **Website button** — a copy-paste HTML/React snippet (branded "Call us on WhatsApp" button) using the deep link; live preview styled with tenant tokens.
   - **WhatsApp message button** — compose + send a `voice_call` interactive message (`display_text` ≤20, `ttl_minutes`, `payload`) to a test/opted-in number via the adapter; show the sent status.
   - **Template** — create/select a `voice_call` template button (for approved re-engagement) and send it with the payload.
   - Everything with inline validation, `Toast` on success, loading/empty/error states, a11y labels, reduced-motion-safe, tenant white-label tokens.

### API glue
5. Thin hooks in `apps/web/lib/api.ts` + routes for: send `voice_call` interactive, create/send template, and a read for recent WhatsApp calls + today's stats (reuse calls/analytics/cost services). No new heavy backend.

### Tests
6. Payload composition (fields → convention string, and it round-trips as `cta_payload`/`deeplink_payload` in a mocked webhook); deep-link/QR/snippet correctness; send-interactive/template hit the adapter with the right body; panel renders gated vs enabled states; a11y + reduced-motion + loading/empty/error. (Web unit/component tests; backend send tested against a fake adapter.)

## Definition of Done
- [ ] `/dashboard/whatsapp-calling` is a lovely, obvious home: setup stepper (gated) → status hero + stat tiles + recent calls + settings entry.
- [ ] The generator produces a working deep link, QR, website snippet, and sendable `voice_call` message/template — each carrying a **context payload** the agent uses to greet smartly.
- [ ] All UI uses `packages/ui` + tenant tokens; a11y + reduced-motion + loading/empty/error everywhere; first-value-fast.
- [ ] Tests pass; typecheck/lint/build green.

## Self-audit focus
Full A–K. Special attention: **H (this is the showpiece — genuinely delightful, obvious, accessible, on-brand, tenant-themeable), A (payload convention round-trips to the webhook + reaches the agent), B (tenant-scoped sends/reads), I (reuse existing components — no one-off styles).**

## Commit plan
`feat(web,api): WhatsApp Calling dashboard + click-to-call generator [wac-07]` — branch `wac/07-web-panel-clicktocall` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
Tenants have a beautiful WhatsApp Calling home + a click-to-call generator for web/ads/QR. Inbound is fully shipped end-to-end. Next: WAC-08 — permissions + consented outbound.
