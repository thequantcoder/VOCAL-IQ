# DAY 53 — Markup + Wallet Engine + Wholesale->Retail Reconciliation  🧠 OPUS  ·  *(may take 2 sessions)*

> Execute via the daily loop in `CLAUDE.md §2`: read this fully → confirm prerequisites → restate plan → build with tests → run all checks → **self-audit** → commit & push → update `BUILD-LOG.md` → report.

## Prerequisites (admin)
- Day 13 cost engine; Day 15 billing; Stripe Connect/rebilling decision.

> If any credential/decision above is missing from `.env`/secrets, emit the `🔑 ADMIN ACTION REQUIRED` block (`CLAUDE.md §7`) and wait. Reference `PREREQUISITES.md` for exact signup URLs, plans, scopes, and env var names.

## Context to load
- CLAUDE.md
- Blueprint §8.1
- DATA-MODEL.md (Plan, Wallet, UsageRecord, ResellerMargin)
- CODING-RULES.md

## Objective
The reseller money engine: platform cost -> platform price -> reseller markup -> end-customer charge, computed + reconciled automatically, with prepaid wallets, credit top-ups, and margin dashboards data.

## Step-by-step build
1. Pricing chain: super-admin sets wholesale (platform price); reseller sets retail markup; end-customer charged via subscription + metered usage from a prepaid wallet or invoice.
2. Wallet engine: balances, top-ups, auto-recharge, low-balance alerts, drain per minute; idempotent transactions.
3. Reconciliation: attribute each minute up the chain; compute ResellerMargin (revenue - cost) + platform revenue per period; ledger with audit trail.
4. Stripe rebilling/Connect for reseller payouts/charges as chosen.
5. Tests: pricing-chain math, wallet drain idempotency, reconciliation accuracy across the hierarchy, edge cases (refunds, partial minutes, currency).

## Definition of Done
- [ ] Cost->wholesale->retail->customer computed + reconciled; wallets work; margins accurate; tests pass.

## Self-audit focus
Run the **full** `SELF-AUDIT-PROTOCOL.md` (all sections A–K). Pay special attention to: **D (money correctness — critical) + B (per-tenant ledgers) + C (idempotency, no double-charge).**

## Implementation detail & gotchas (read before coding — this handles money, be precise)
- **Use integer minor units (cents), never floats**, for all balances/prices/margins. Round only at display. Store currency per record.
- **Every wallet mutation is an idempotent, append-only ledger entry** (not just a mutable balance field). Balance = sum of ledger entries (or a cached balance reconciled against the ledger). Use a stable idempotency key per charge so retries don't double-debit (`CODE-PATTERNS.md §10`).
- **Pricing chain computed per metered minute:** platform cost (from `UsageRecord`) → wholesale price (super-admin set) → reseller retail (reseller markup) → end-customer charge. Persist each layer so margins are auditable.
- **Concurrency:** wallet debits during live calls race — use DB transactions + row locks (or atomic decrement) so balance never goes inconsistent under parallel calls.
- **Edge cases to handle:** partial minutes, refunds/chargebacks, failed top-ups, currency mismatch (reseller vs customer), negative-balance prevention (hard stop + grace policy), mid-period plan/markup changes.
- **Reconciliation job** recomputes ResellerMargin (revenue − cost) + platform revenue per period from the ledger; must tie out to the penny against Stripe payouts. Alert on drift.
- **Stripe rebilling/Connect:** decide the payout model (reseller charges its own customers vs platform charges + remits) — confirm with admin; keep the two money flows separate + audited.

## Acceptance tests (must exist + pass)
- [ ] Pricing-chain math exact (cents): cost + wholesale + markup → customer charge, reseller margin, platform revenue.
- [ ] Idempotency: replaying a charge event does NOT double-debit.
- [ ] Concurrency: N parallel debits on one wallet sum correctly, never over-draw.
- [ ] Reconciliation ties out: sum(ledger) = balance; period margin = revenue − cost, to the penny.
- [ ] Negative-balance guard stops calls per grace policy when wallet exhausted.
- [ ] Refund / partial-minute / currency-mismatch handled; per-tenant ledger isolation holds.

## Commit plan
`feat(api,workers): markup + wallet engine + reconciliation (Day 53)` — branch `day/53-markup-wallet-engine` → PR → CI green → merge to `main`. Multiple commits during the day are encouraged.


> 💾 **Auto-save & push:** all code is saved in `/Users/saransh/Documents/VOCAL-IQ`. After this day (and after every increment within it), automatically `git add` → `commit` (descriptive message) → `git push` to `https://github.com/thequantcoder/VOCAL-IQ`. Never leave the remote behind.
## Report to admin
The reseller economics work — the moat. Next: reseller portal dashboards.
