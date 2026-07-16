# WAC 06 — Cost metering + wallet + reseller margin for WhatsApp minutes  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.
>
> 💰 **Money-critical (golden rule #4).** No WhatsApp calling path ships without cost attribution. Follow `CODE-PATTERNS.md` cost + charge patterns verbatim.

## Prerequisites (admin)
- WAC-04 merged. Confirm the **managed markup** on WhatsApp minutes (plan Part L) + BYOK-vs-managed.

> Missing? Emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait.

## Context to load
- `docs/WHATSAPP-CALLING-AI-ENGINE-PLAN.md` — **§A.9 (pricing: inbound FREE; outbound per-country per-minute, 6-s pulses round-up, only-if-answered, monthly volume tiers, 16 currencies), §I (attribution)**.
- `CODE-PATTERNS.md` — cost metering + `chargeCall` + reseller-margin patterns.
- WAC-01 `whatsappCallCostCents`; `apps/api/src/cost/cost.service.ts`; `apps/api/src/wallet/wallet.service.ts` (`chargeCall`, `debit`, `accrueMargin`, promo-before-paid from PARITY-08); `packages/provider-router/src/pricing.ts`; `apps/voice/app/providers/pricing.py`.
- WAC-02 Terminate handling (`durationSeconds`, destination country).

## Objective
Attribute the **true cost of every WhatsApp call** to the tenant (and reseller margin) in real time, exactly like PSTN — **inbound = $0 but logged**, **outbound = per-country per-minute (6-s pulses, only-if-answered), monthly-tiered** — routed through the existing wallet/ledger so BYOK vs managed + promo credits + reseller reconciliation all work unchanged.

## Step-by-step build
1. **Price table** — flesh out the `whatsapp_calling` rate source (WAC-01) with a real per-country, per-tier card (seed the top ~20 destination countries in USD + the tier bands; TODO to auto-load Meta's quarterly card in 16 currencies). Mirror in `apps/voice/app/providers/pricing.py` if the voice side needs it.
2. **Metering on Terminate** — when a WhatsApp call terminates (WAC-02): compute STT+LLM+TTS cost (existing per-call cost) **plus** the WhatsApp carrier cost = `whatsappCallCostCents(durationSeconds, destCountry, monthlyTier)` (inbound ⇒ carrier=0). Write a `UsageRecord` (channel=WHATSAPP, `billableCents`, breakdown) even for inbound (billable=0) for analytics/margin visibility.
3. **Wallet charge** — for outbound, route through the existing `wallet.chargeCall(...)` so promo-before-paid, no-overdraw, idempotency (by call key), and **reseller margin accrual** all apply. Inbound writes the UsageRecord but debits 0.
4. **Monthly tier accrual** — track the tenant's (or platform's, in managed) monthly WhatsApp outbound minutes per destination to pick the right tier; boundary uses the lower rate; resets monthly (mirror the messaging tier accrual).
5. **Dashboard surfacing** — WhatsApp call cost appears in the existing cost/wallet/analytics views with a channel breakdown (reuse `StatCard`/`DonutBreakdown`/`AreaTrend`); reseller margin includes WhatsApp minutes; a "WhatsApp minutes this month + current tier" tile.
6. **Tests** — cost math: 56 s outbound = 10 pulses × rate; inbound = 0 but UsageRecord written; tier boundary picks lower rate; idempotent (replayed Terminate never double-charges); promo credits consumed before paid on a WhatsApp outbound; reseller margin accrued once; tenant-scoped; wallet balance reconciles to the ledger.

## Definition of Done
- [ ] Every WhatsApp call writes a `UsageRecord` (inbound billable=0, outbound metered) and outbound debits the wallet via `chargeCall` (promo-before-paid, idempotent, no overdraw).
- [ ] Per-country, 6-s-pulse, only-if-answered, monthly-tiered pricing is correct + unit-tested.
- [ ] Reseller margin + BYOK/managed + promo credits all work for WhatsApp minutes; cost surfaced in dashboards.
- [ ] Tests pass; wallet ties out to the ledger.

## Self-audit focus
Full A–K. Special attention: **D (exact pricing; no unmetered path; inbound logged-at-0), A (6-s pulse rounding, tier math, idempotent metering — no double-charge on replayed Terminate), B (tenant/reseller attribution), C (payment/wallet safety — reuse the audited `chargeCall`).**

## Commit plan
`feat(api,provider-router): WhatsApp calling cost metering + wallet [wac-06]` — branch `wac/06-cost-metering` → PR → CI green → merge.

> 💾 **Auto-save & push** to `https://github.com/thequantcoder/VOCAL-IQ` after every increment.

## Report to admin
WhatsApp call cost is fully attributed (inbound free, outbound metered) through the existing wallet/reseller engine. Next: WAC-07 — the dashboard panel + click-to-call generator.
