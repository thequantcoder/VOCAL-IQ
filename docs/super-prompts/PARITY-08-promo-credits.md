# PARITY 08 — Promotional / Bonus Credits (wallet)  🧠 OPUS

> Execute via the daily loop in `CLAUDE.md §2`. Billing/metering-sensitive — Opus.

## Prerequisites (admin)
- None (uses the existing wallet). Real top-ups still go through Stripe (gated as today).

## Context to load
- CLAUDE.md · golden rules #3 (BYOK/managed) + #4 (cost attribution)
- Day 53 wallet/markup engine + Day 15 billing (wallet ledger, credit deduction on metered usage)
- `docs/COMPETITOR-FEATURE-ANALYSIS.md` delta #8

## Objective
Add **promotional / bonus credits** to the wallet: grants (signup bonus, promo code, manual admin grant, referral) that are **spent before paid credits**, can **expire**, and never withdraw as cash — with a clean ledger + reporting so cost attribution stays correct.

## Step-by-step build
1. Data: extend the wallet ledger with a `CreditGrant` (tenantId, amount, kind=promo|bonus|referral|manual, source, expiresAt?, remaining) + ledger entries tagged as promo vs paid. RLS.
2. Spend order: when metered usage deducts credits, **consume non-expired promo/bonus first**, then paid balance; record which bucket paid (so margin/attribution reports separate promo-funded usage).
3. Promo codes: redeemable codes (single/multi-use, cap, expiry) → create a grant on redemption; abuse-guard (one per tenant, etc.).
4. Admin/reseller: grant/revoke bonus credits (RBAC + audit). Web: wallet shows promo vs paid balance + expiry; redemption box.
5. Tests: spend-order (promo before paid), expiry excluded, redemption + caps, revoke, attribution split, tenant scope, ledger balances reconcile.

## Definition of Done
- [ ] Promo/bonus grants + promo codes work, are spent before paid credits, expire correctly, are audited, and keep cost attribution accurate; tests pass.

## Self-audit focus
Full A–K. Special attention: **D (attribution: promo-funded usage separated), A (spend-order + expiry + ledger reconciliation), G (redemption abuse caps), B (tenant scope).**

## Commit plan
`feat(api,web,db): promotional/bonus credits in the wallet [parity-08]` — branch `parity/08-promo-credits` → PR → CI → merge.

## Report to admin
Promo/bonus credits live. Next: PARITY-09 in-app API reference.
