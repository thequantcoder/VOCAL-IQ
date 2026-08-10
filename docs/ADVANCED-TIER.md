# VocalIQ Advanced Tier (Phase 6) — Launch Notes

> Shipped at **Day 94** (advanced-tier integration + hardening). This is the differentiator tier that
> sits on top of the sellable v1.0 (completed at Day 66). Everything here is **plan-gated** so heavy /
> sensitive features stay on the right tiers and margins hold.

## What's in the advanced tier

| Feature | Day | Tier (default) | Notes |
|---|---|---|---|
| Conversation intelligence | 75 | Pro+ | Signals mined from transcripts |
| Multi-agent benchmarking | 86 | Pro+ | Compare agents head-to-head |
| Visual workflow automation | 85 | Pro+ | Zapier-style builder |
| Voice analytics BI API | 87 | Pro+ | Enterprise BI exports |
| Real-time translation | 88 | Pro+ · **heavy** | Caller ↔ operator, metered LLM |
| Learn from top reps | 89 | Pro+ | Persona improvements from best calls |
| Live call co-pilot | 90 | Pro+ | Standalone wedge for human teams |
| Extra channels (Telegram/Messenger/Instagram/RCS) | 93 | Pro+ | Same runtime, more surfaces |
| Developer apps & integrations | 84 | Scale | Metered API + app marketplace |
| Agent marketplace | 83 | Scale | Buy/sell agents |
| **Video avatar agents** | 92 | Scale · **heavy** | Plan-gated, auto voice fallback, metered/sec |
| **Voice biometrics** | 91 | Scale · **heavy/sensitive** | Default-deny, consent + region gated, encrypted |

## Entitlements model (Day 94)

- The catalogue + tier defaults live in `@vocaliq/shared` → `phase6-features.ts`
  (`PHASE6_FEATURES`, `PLAN_FEATURE_DEFAULTS`, `planIncludesFeature`, `resolveAdvancedFeatures`).
- Resolution order: an **explicit** boolean on the plan's `features` map wins (custom plans via the
  Day-56 plan builder can override), else the **tier default** by plan name, else denied.
- `EntitlementsService` exposes `hasFeature(tenantId, key)`, `assertFeature(tenantId, key)` (throws a
  clear upgrade `BillingError`), and `entitlements(...).advancedFeatures` (the resolved map surfaced to
  the dashboard on the Wallet page).
- **Enforced today:** video avatars gate on `videoAvatar` (Scale) → non-entitled sessions auto-fall
  back to voice. Voice biometrics is default-deny (off + region-gated). The remaining features surface
  their entitlement to the UI; wire `assertFeature` at a route/service before adding hard server gates.

## Heavy-feature margin notes (self-audit D)

- **Video avatars** — billed per second on `AvatarSession.costUsd`; Scale-only; auto voice fallback
  means non-entitled tenants incur **no** video cost.
- **Translation** — every translation is a metered RouterService call, deduped by a source-keyed
  cache; Pro+.
- **Voice biometrics** — no LLM spend; the provider call is one per enroll/verify; Scale-only + off by
  default.
- **Extra channels** — SMS per-segment, WhatsApp/RCS per-message, Telegram/Messenger/Instagram free.

## Provider gating (activation is keys-only)

Several advanced features ship provider-gated and degrade safely until credentials are set:
`VOICE_BIOMETRICS_API_KEY` (biometrics → default-deny), `AVATAR_PROVIDER_API_KEY` (avatars → voice
fallback), and the Day-93 channel keys (`TELEGRAM_*`, `MESSENGER_*`, `INSTAGRAM_*`, `RCS_*` → QUEUED /
503). See `PREREQUISITES.md` Group F.
