# CODING-RULES.md — Coding Standards & Quality Bar

These rules apply to **every** line of code Claude writes for VocalIQ. They exist so the codebase stays clean, secure, fast, and easy for future-you to extend. Violating them is a self-audit failure.

---

## 1. Language & typing

- **TypeScript strict mode on** (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). 
- **No `any`.** Use `unknown` + narrowing, generics, or proper types. If a third-party type is missing, write a minimal local type.
- **No non-null assertions (`!`)** unless preceded by a guarded check; prefer explicit handling.
- **Discriminated unions** for state/results; avoid boolean soup.
- **Result/error types** for fallible operations where it aids clarity (e.g. `Result<T, E>`); otherwise throw typed errors.
- **Python:** full type hints + Pydantic v2 models for all I/O; `mypy`/`pyright` clean.

## 2. Validation at every boundary

- **Zod** schema for every API request body, query, params, and response; for every env var (parse at boot, fail fast).
- **Pydantic** for every FastAPI route and provider payload in the voice service.
- Never trust client input, webhook payloads, or provider responses without validation.
- Reject early; return precise 4xx with safe messages.

## 3. Structure & size

- **One responsibility per function/module.** If a function exceeds ~40 lines or needs "and" to describe it, split it.
- **Pure core, impure edges.** Business logic is pure and testable; side-effects (DB, network, queues) live in thin adapters.
- **Dependency injection** for providers/clients (NestJS DI; explicit params in Py) — never `new` a provider deep in logic.
- **No god files.** Modules are cohesive; shared types in `packages/shared`.

## 4. Multi-tenancy (repeat of the golden rule — it matters most)

- Every query filters by `tenantId`. Every new table gets `tenantId` + index + RLS policy.
- Use the `@CurrentTenant()` decorator / injected tenant context; never read tenant from raw request body.
- Add/extend the cross-tenant isolation test whenever you touch data access.
- Cache keys, queue job names, R2 paths, and Socket.IO rooms are all tenant-namespaced.

## 5. Provider calls

- All LLM/TTS/STT/telephony calls go through `packages/provider-router` (or its Python mirror).
- Every call emits a `UsageRecord` (provider, units, costUsd, byok). A calling path without metering is a bug.
- Respect BYOK vs managed: pick the right key; never bill BYOK token usage.
- Implement fallback chains and timeouts; a single provider outage must not take down calls.

## 6. Security

- **Secrets**: only from env/secrets manager; provider keys in DB are envelope-encrypted; never log secrets, tokens, full card numbers, or raw transcripts containing PII at info level.
- **Webhooks**: verify signature + timestamp; dedupe replays via Redis nonce.
- **Authz**: enforce RBAC in guards on every mutation and sensitive read; deny by default.
- **Injection**: parameterised queries only (Prisma handles it); sanitise any raw SQL; escape output in UI.
- **Rate limiting & abuse**: per-tenant call caps, anomaly detection, per-number kill-switch on calling endpoints.
- **PII**: redact in transcripts where required; honour retention/deletion policies; PCI-safe payment capture keeps card data out of recordings.

## 7. Errors & logging

- No empty `catch`. Handle, wrap with context, or rethrow a typed error.
- User-facing errors are friendly and leak nothing internal; log the detail server-side with a correlation id.
- Structured logging (pino/structlog) with tenant + request + call ids; never log secrets.
- All errors reported to Sentry with context (no PII).

## 8. Performance & latency (voice is latency-critical)

- Stream everything in the call loop (STT partials, LLM tokens, TTS chunks). Target time-to-first-audio < ~800ms; perceived turnaround < 1.5s.
- Avoid N+1 queries; batch and index; use `select` projections.
- Cache hot reads in Redis with tenant-scoped keys + sensible TTLs + invalidation.
- Paginate large lists (cursor-based). Stream large exports.
- Measure: add timing metrics on the call loop and key endpoints; surface in Grafana.

## 9. Tests (ship with every feature)

- **Unit** for all business logic (Vitest / pytest). Cover happy path + edge + failure.
- **Integration** for API + DB (test DB, real Prisma) including a tenant-isolation assertion.
- **E2E** (Playwright) for critical user journeys (sign up → create agent → place test call → see transcript/cost).
- **Contract tests** for the provider-router interfaces.
- Voice loop: simulated-conversation tests (the testing/QA suite from Phase 2.5) for agent behaviour.
- Coverage is a guide, not a religion — but new logic without tests fails the audit.

## 10. UI specifics

- Use `packages/ui` components + design tokens; don't re-style ad hoc.
- **Dark mode** from day one (`class` strategy); respect tokens for both themes.
- **Accessibility**: semantic HTML, labels, keyboard nav, focus states, ARIA where needed, color contrast.
- **Responsive**: mobile-first; the dashboard works down to small screens.
- **Motion** via Framer Motion but never blocking interaction or hurting performance; respect `prefers-reduced-motion`.
- **No `localStorage`/`sessionStorage`** for app state in artifacts/previews — use React state or server data.
- Loading/empty/error states for every async view; optimistic updates where safe.

## 11. Comments & docs

- Public functions/classes get a one-line doc comment (purpose + non-obvious constraints).
- Comment **why**, not what. Delete commented-out code.
- Each module gets a short header comment if its role isn't obvious.
- Update the relevant `.md` if you change a contract (schema, router interface, env var).

## 12. Dependencies

- Prefer the pinned stack in `TECH-STACK.md`. Adding a dep requires: it's maintained, it's the standard choice, and it's noted in `BUILD-LOG.md` with why.
- No left-pad-style micro-deps for things trivially written.
- Never add a dep that needs secrets without wiring it through the secrets flow.

## 13. Git hygiene (see `GIT-WORKFLOW.md`)

- Small, logical commits; conventional-commit messages; reference the day.
- Never commit secrets, `.env`, build artefacts, or large binaries.
- CI green before push is considered done.

## 14. Auto-suggestions Claude should proactively make

While building, Claude should (briefly) flag and, where safe, implement:
- Missing indexes, N+1s, or slow queries it notices.
- Edge cases not in the prompt (empty states, concurrency, timezones, currency, i18n).
- Security gaps (unvalidated input, missing authz, unscoped query).
- Better abstractions when duplication appears (rule of three).
- Cheaper provider routing opportunities.
- Anything that would break multi-tenancy or cost-attribution.
Surface these in the daily report under "Proactive suggestions" — implement the low-risk ones, list the bigger ones for admin decision.

## 15. When stuck or uncertain about a third party

- **Fetch and read the official docs** before coding against any API. Do not guess endpoint shapes, auth, or webhook formats.
- If behaviour is ambiguous, write a tiny spike/test against the sandbox, confirm, then build.
- If a decision is architectural, pause and recommend escalating to Opus (see `CLAUDE.md §8`).
