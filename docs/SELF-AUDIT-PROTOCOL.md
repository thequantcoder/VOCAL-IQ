# SELF-AUDIT-PROTOCOL.md — Mandatory After Every Day

After building each day's work and **before** committing, Claude runs this audit, writes it out in the daily report, fixes everything it can, re-runs checks, and only then commits. A day is **not complete** without a passed audit. Be honest — finding issues now is cheaper than in production.

---

## How to run it

1. Go through every section below for the code you touched today.
2. For each check: mark ✅ pass, ⚠️ fixed (describe the fix), or ❌ open (must be resolved or explicitly deferred with admin sign-off).
3. Apply fixes for everything fixable now.
4. Re-run typecheck + lint + tests.
5. Paste the completed audit into the daily report and into `BUILD-LOG.md`.

---

## Section A — Correctness & completeness
- [ ] Does the code do exactly what the day prompt's *Definition of Done* requires? List each DoD item and confirm.
- [ ] Edge cases handled: empty inputs, large inputs, concurrency, timezones, currency, multi-language, null/undefined.
- [ ] No half-finished paths, no dangling TODOs (or logged in `BUILD-LOG.md` if intentionally deferred).
- [ ] Manual sanity check of the main flow performed (describe what you ran).

## Section B — Multi-tenancy isolation (highest priority)
- [ ] Every new/changed query filters by `tenantId`.
- [ ] New tables have `tenantId` + index + RLS policy.
- [ ] Cross-tenant isolation test exists and passes (a foreign tenant sees zero rows).
- [ ] Cache keys, queue jobs, R2 paths, sockets are tenant-namespaced.
- [ ] Reseller subtree access is correct (reseller sees own children only).

## Section C — Security
- [ ] No secrets in code, logs, or client bundle. Provider keys encrypted at rest.
- [ ] All inputs validated (Zod/Pydantic). All webhooks signature+timestamp verified with replay protection.
- [ ] RBAC enforced on every new mutation/sensitive read; deny-by-default.
- [ ] No injection vectors; parameterised queries; output escaped.
- [ ] PII handled per policy (redaction/retention); nothing sensitive logged at info level.
- [ ] Rate limiting / abuse controls present on any new calling or public endpoint.

## Section D — Cost attribution & provider routing
- [ ] Any provider call goes through the router and emits a `UsageRecord`.
- [ ] BYOK vs managed handled correctly (right key, correct/zero billing).
- [ ] Fallback + timeout present; one provider failing doesn't break the path.

## Section E — Tests
- [ ] Unit tests for new logic (happy + edge + failure).
- [ ] Integration tests for new API/DB paths (incl. tenant isolation).
- [ ] E2E updated if a critical journey changed.
- [ ] All tests pass locally; flaky tests fixed, not skipped.

## Section F — Performance & latency
- [ ] No N+1; appropriate indexes; projections used.
- [ ] Call-loop paths stream and meet latency targets (TTFA < ~800ms where applicable).
- [ ] Large lists paginated; large outputs streamed.
- [ ] Hot reads cached with correct invalidation.

## Section G — Error handling & observability
- [ ] No silent catches; errors typed, wrapped, surfaced to Sentry with context.
- [ ] User-facing errors are friendly and leak nothing.
- [ ] Structured logs include tenant/request/call ids; metrics added for new critical paths.

## Section H — UI quality (if UI touched)
- [ ] **Identity applied, not defaults:** matches `DESIGN-SYSTEM.md` (palette, type incl. display/mono faces, radii, the waveform motif) — does NOT look like stock shadcn.
- [ ] Dark mode **and** light mode correct; design tokens used; tenant white-label tokens flow through (where relevant).
- [ ] Responsive on mobile; touch targets ≥44px; no hover-only affordances.
- [ ] Accessibility AA: keyboard nav, visible focus, labels, contrast (both themes), no color-only signalling.
- [ ] `prefers-reduced-motion` respected with real fallbacks; motion follows `DESIGN-SYSTEM.md §4` (deliberate, not scattered); cyan reserved for live/real-time.
- [ ] Loading (skeletons, not spinners) / empty / error / success states for every async view; empty states invite action.
- [ ] Perceived-performance floor (`DESIGN-SYSTEM.md §7`): optimistic UI, long lists virtualised, instant URL-synced filters, no layout-shift/white-flash.
- [ ] Copy follows `DESIGN-SYSTEM.md §9` (plain verbs, consistent vocabulary, helpful errors).
- [ ] No `localStorage`/`sessionStorage` for app state in previews.

## Section I — Regression ("did I break anything")
- [ ] Searched for all call sites of changed shared code; updated them.
- [ ] Ran the broader test suite, not just today's tests.
- [ ] Verified previously-built features still work (name which you re-checked).
- [ ] No breaking change to a public/shared contract without updating consumers + docs.

## Section J — Code quality & docs
- [ ] Strict typing; no `any`/unjustified `!`.
- [ ] Functions small and single-purpose; no duplication beyond rule-of-three.
- [ ] Public APIs documented; relevant `.md` updated if a contract changed.
- [ ] Dead code removed; imports clean; formatter/linter clean.

## Section K — Build & CI
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass.
- [ ] Voice service: `pytest` + type check pass.
- [ ] CI config updated if new app/package/test added.

---

## Audit output template (paste filled-in)

```
## Self-Audit — Day {{N}} ({{title}})

A. Correctness: ✅/⚠️/❌ — notes
B. Tenancy:     ✅/⚠️/❌ — notes
C. Security:    ✅/⚠️/❌ — notes
D. Cost/router: ✅/⚠️/❌ — notes
E. Tests:       ✅/⚠️/❌ — notes (X unit, Y integ, Z e2e; all green)
F. Performance: ✅/⚠️/❌ — notes
G. Errors/obs:  ✅/⚠️/❌ — notes
H. UI:          ✅/⚠️/❌/NA — notes
I. Regression:  ✅/⚠️/❌ — re-checked: {{features}}
J. Quality/docs:✅/⚠️/❌ — notes
K. Build/CI:    ✅ all green

Fixes applied this audit: {{list}}
Open/deferred (with reason + admin note): {{list or "none"}}
Proactive suggestions: {{list}}
```

> If any section is ❌ and not explicitly deferred with admin agreement, **do not commit** — fix first.
