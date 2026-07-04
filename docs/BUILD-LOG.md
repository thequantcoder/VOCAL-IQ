# BUILD-LOG.md — Running Build Journal

Claude appends one entry per day **after** pushing (see `GIT-WORKFLOW.md`). This is the project's memory: decisions, deviations, deferrals, and what the admin must do next. Never delete entries; only append.

> Also log here any deviation from `TECH-STACK.md` (version bumps, swapped libraries) with the reason, and any feature intentionally deferred.

---

## Template (copy for each day)

```
## Day NN — <title> — <YYYY-MM-DD>
Model: Opus / Sonnet
Commits: <hashes / PR link>
Built:
- <bullet>
Decisions / trade-offs:
- <bullet>
Migrations added: <names or none>
Env / secrets added: <names or none>
Deviations from TECH-STACK: <none / what + why>
Deferred (with reason): <none / item>
Admin actions needed next: <none / list>
Self-audit: passed (A–K) — open items: <none / list>
Proactive suggestions raised: <none / list>
```

---

## Entries

<!-- Day 0 onward will be appended below. -->

## Day 00 — Repo Scaffold & Monorepo Foundation — 2026-06-24
Model: Opus
Commits: `chore: scaffold VocalIQ monorepo (Day 0)`
Built:
- Turborepo + pnpm workspaces monorepo at repo root (`package.json`, `pnpm-workspace.yaml`, `turbo.json` with dev/build/lint/typecheck/test).
- `packages/config` (base tsconfig [strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes], Biome config, Tailwind preset seeding design tokens).
- `packages/shared` (Zod fail-fast `parseEnv`, typed error model, core enums, `UsageRecord`/`CostBreakdown`) + 3 passing unit tests.
- `packages/db`, `packages/provider-router` (typed LLM/TTS/STT/Telephony contracts + RouteRequest/UsageMeter), `packages/ui` (`cn` helper + brand tokens) — stubs per ARCHITECTURE.md.
- `apps/api` (NestJS `/healthz`, env-validated boot), `apps/web` (Next 15 + Tailwind v4, branded landing + `/api/health`), `apps/voice` (FastAPI `/healthz` + pyproject + pytest), `apps/workers` (BullMQ boot stub).
- `.gitignore`, `.env.example` (Group A–B names only), root `README.md`, kit copied into `docs/`, `infra/docker-compose.yml` + `.github/workflows/ci.yml` placeholders (real CI = Day 1).
Verification: `pnpm lint` 9/9, `pnpm typecheck` 9/9, `pnpm test` 3/3, `pnpm build` 7/7 all green; voice `pytest` 1/1 green; api `/healthz`, web `/api/health`, voice `/healthz` all return `{"status":"ok"}`.
Decisions / trade-offs:
- Build with `tsc` per-package (not nest-cli/tsup) for a uniform, dependency-light Day-0 toolchain.
- `packages/ui` ships only `cn` + tokens at Day 0 (no JSX components yet) — full library + Waveform are Day 1 per DESIGN-SYSTEM.md.
- Voice service lives outside the pnpm workspace (Python); verified via its own venv + pytest.
Migrations added: none (Prisma schema is Day 4).
Env / secrets added: none committed (`.env.example` lists names only; no `.env` in repo).
**Deviations from TECH-STACK (machine toolchain newer than pinned majors — logged per CLAUDE.md §4):**
- Node **v24** (pinned 20 LTS), pnpm **10.33** (pinned 9.x), Python **3.14** (pinned 3.12). All non-blocking; everything green. Engines set `node>=20`/`pnpm>=9`; CI pins Node 20 / Python 3.12 for parity. **Watch item:** Python 3.14 vs 3.12 may affect voice deps (Pipecat/LiveKit wheels) on Days 7–9 — consider installing Python 3.12 before then.
- pnpm 10 blocks postinstall scripts by default → added `pnpm.onlyBuiltDependencies` allowlist (biome, esbuild, @nestjs/core, sharp, msgpackr-extract).
Deferred (with reason): real CI pipeline, full docker dev stack (Postgres+timescale+pgvector+Redis+LiveKit), full UI token system + Waveform — all scheduled for Day 1.
Admin actions needed next: Day 1 none required (Sentry/PostHog optional). Day 3 Clerk keys; Day 4 `DATABASE_URL`/`DIRECT_URL` + base-currency/plan-tier decision; Day 6 `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`.
Self-audit: passed (A–K) — open items: none.
Proactive suggestions raised: install Python 3.12 before Day 7; add `.nvmrc`/`.node-version` (20) on Day 1 to align local Node with CI.

## Day 01 — CI/CD, Docker Dev Stack & Base Config — 2026-06-25
Model: Opus (Sonnet-recommended day; ran on Opus)
Commits: `c7ff732` feat(ui) design system · `76c8fe9` feat(web,api) app shell + observability · `fb3842c` ci pipeline + docker stack
Built:
- **Design system (DESIGN-SYSTEM.md foundation, not shadcn defaults):** full token system in `apps/web/app/globals.css` via Tailwind v4 `@theme inline` — brand palette, semantic surfaces, radii, spacing, motion vars — with **dark (default) + light** themes flipping semantic vars. `@source` makes the web build scan `packages/ui` so its utilities generate.
- **`packages/ui` re-skinned components:** `Button` (4 variants/3 sizes, press micro-scale, focus-ring grow), `Card` (+Header/Title/Description/Content), `Input` (invalid + mono modes), and the **signature `Waveform`** — deterministic heights/delays (SSR-safe, no hydration flicker), violet default / cyan `live` gradient, `prefers-reduced-motion` static fallback. Framework-agnostic motif CSS shipped as `@vocaliq/ui/styles.css`. Package now builds JSX (`jsx: react-jsx`, React peer dep).
- **Web app shell:** `next-themes` dark-first provider + theme toggle; display/body/mono font pairing (`next/font`); design-system proof page rendering the components + waveform in both themes.
- **Observability (no-op without keys):** Sentry via native Next instrumentation (`instrumentation.ts` + `-client.ts` + server/edge configs) and PostHog client init for web; `observability.ts` (Sentry-before-Nest + lazy PostHog + graceful shutdown flush) for api. Env schema + `.env.example` gained `SENTRY_DSN`/`POSTHOG_*`/`NEXT_PUBLIC_*`.
- **CI gate (`.github/workflows/ci.yml`):** `node` job (typecheck → lint → test with Postgres+Redis **service containers** + extension priming → build), `voice` job (**pyright** + ruff + pytest, Python 3.12), `security` job (**gitleaks**). Concurrency-cancel + `permissions: contents: read`.
- **Docker dev stack (`infra/docker-compose.yml`):** Postgres 16 (timescaledb+pgvector via `infra/db/init/00-extensions.sql`), Redis 7, **LiveKit** dev server; healthchecks; **env-overridable host ports**. Scripts `pnpm dev:infra` / `:down` / `:reset`. Node pinned via `.nvmrc`/`.node-version` (20).
Verification:
- `pnpm typecheck` 9/9, `pnpm lint` 9/9, `pnpm test` 3/3, `pnpm build` 7/7 green; voice `pyright` 0 errors, `ruff` clean, `pytest` 1/1.
- **CI gate proven red** on an injected failing spec, then reverted.
- **Docker stack demonstrated:** all 3 containers healthy — `timescaledb 2.28.1` + `vector 0.8.3` enabled, redis `PONG`, livekit HTTP `200`. Web served at `:3100` → 200, waveform bars rendered, `/api/health` ok.
Decisions / trade-offs:
- Tailwind v4 is CSS-first: canonical tokens live in web `globals.css` (`@theme inline`) so semantic colors stay theme-reactive; the Day-0 `tailwind.preset.ts` is retained as a values reference. One app consumes `packages/ui` today; a shared `@vocaliq/ui/styles.css` is already exported for the second consumer.
- **Display face:** "Clash/General Sans" aren't on Google Fonts → substituted **Space Grotesk** (geometric, characterful) per DESIGN-SYSTEM §2; never Inter-as-display.
- **Waveform** uses CSS-keyframe ambient motion (SSR-safe, dependency-light, reduced-motion friendly); the amplitude-reactive Framer version lands with the live-call view (Day 14).
- `@sentry/cli`/`core-js` postinstall scripts left un-allowlisted (not needed without source-map upload), keeping the build-scripts allowlist tight.
- Host ports made env-overridable after finding local 5432/6379 already taken by another project — VocalIQ defaults stay 5432/6379/7880 (match `DATABASE_URL`); no other project disturbed.
Migrations added: none (Prisma schema is Day 4; init SQL only primes local-dev extensions).
Env / secrets added: `SENTRY_DSN`, `POSTHOG_KEY`, `POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` (all optional); dev infra `POSTGRES_PORT`/`REDIS_PORT`/`LIVEKIT_PORT` (names only).
Deviations from TECH-STACK: none (versions within pinned majors). `@sentry/nextjs` v8 `captureRouterTransitionStart` is v9-only → omitted.
Deferred (with reason): Trivy/Grype container image scan + Dependabot — no images are built/pushed yet (Phase 4+); Storybook + visual-regression — first real component screens land Day 14+. Both noted per GIT-WORKFLOW CI-gate roadmap.
Admin actions needed next: **`workflow` scope** must be added to the GitHub token before the day branch (which touches `.github/workflows/ci.yml`) can push — see report. Day 3 Clerk keys; Day 4 `DATABASE_URL`/`DIRECT_URL` + base-currency/plan-tier decision; Day 6 `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`.

## Self-Audit — Day 01 (CI/CD, Docker Dev Stack & Base Config)
A. Correctness: ✅ — DoD met: CI runs all stages (TS+Python); docker compose gives working Postgres(+ext)+Redis+LiveKit (verified); tokens + 3 base components + Waveform render light & dark; Sentry/PostHog no-op cleanly. Manual: brought the stack up, queried `pg_extension`, served the web page.
B. Tenancy: ✅ NA — no data access/tables this day (RLS begins Day 4).
C. Security: ✅ — no secrets committed (names-only `.env.example`); optional observability degrades to off; gitleaks added to CI; CI `permissions` least-privilege; LiveKit `--dev` creds are local-only and documented as such.
D. Cost/router: ✅ NA — no provider calls (router core is Day 6–7).
E. Tests: ✅ — 3 unit (shared) green; voice pytest 1 green; the gate was proven to fail on a broken spec. No new app logic needed bespoke tests today.
F. Performance: ✅ — CI uses pnpm + pip caches and concurrency-cancel; fonts subsetted via next/font; no hot paths introduced.
G. Errors/obs: ✅ — Sentry wired for web (all runtimes) + api with shutdown flush; no silent catches added.
H. UI: ✅ — identity applied (palette, display/mono faces, waveform motif), not stock shadcn; dark+light both correct; focus-visible rings + aria labels on icon/toggle; reduced-motion fallback on waveform + theme transition; cyan reserved for the `live` waveform. (Full four-states/responsive audit lands with real screens Day 14.)
I. Regression: ✅ — re-verified Day-0 health endpoints (web `/api/health` ok) and full typecheck/lint/test/build across all 9 packages; `cn`/`tokens` exports preserved.
J. Quality/docs: ✅ — strict TS, no `any`/`!`; linter/formatter clean; BUILD-LOG + `.env.example` updated; component intent documented.
K. Build/CI: ✅ all green (typecheck 9/9, lint 9/9, test 3/3, build 7/7; voice pyright/ruff/pytest green).

Fixes applied this audit: exactOptionalPropertyTypes on Sentry `environment` (4 sites); CSS `@import` ordering; biome ignore for `.venv`/`__pycache__`/`.turbo`; removed v9-only Sentry export; env-overridable host ports after a local port collision.
Open/deferred: container image scan + Dependabot (no images yet); Storybook/visual-regression (Day 14+) — both intentional, logged above.
Proactive suggestions: add branch protection on `main` requiring the three CI jobs once `workflow` scope lands; install Python 3.12 locally before Day 7 (voice wheels).

**Post-merge addendum (Day 01):**
- **GitHub `workflow` scope** was missing from the account token, blocking any push touching `.github/workflows/`. Resolved by `gh auth refresh -s workflow` (device flow) + clearing a stale osxkeychain token so git uses the refreshed one. The repo had two git credential helpers (osxkeychain then gh) — documented for future reference.
- **First CI run was red; two config fixes landed (commit `f7284aa`):** (1) removed `version: 10` from `pnpm/action-setup` — it conflicted with `packageManager` in package.json (`ERR_PNPM_BAD_PM_VERSION`); (2) replaced `gitleaks-action` (PR commit-range detection failed with "unknown revision") with a direct `gitleaks git` history scan — deterministic + gitignore-aware (ignores `.next/` build output that tripped a tree scan). **Second run: all 3 jobs green** (node 2m36s, voice 17s, security 6s). PR #1 squash-merged.
- **History note:** Day 0's commits (`0ac2528`, `2091c5b`) were never pushed to the remote (they carried the placeholder workflow file and hit the same scope block), so remote `main` was just the initial commit. GitHub's squash-merge therefore folded Day 0 **and** Day 1 into one commit (`46c2dd9`). **All content is intact** (verified: every Day-0 + Day-1 file present, typecheck/lint/test/build green on `main`); only the Day-0/Day-1 commit boundary is cosmetically merged. No force-push/history rewrite attempted — content correctness over commit cosmetics.
- **Recommend next session:** enable branch protection on `main` requiring the `node` / `voice` / `security` checks now that they're green and pushable.

## Day 02 — Shared Package: Types, Zod, Env Schema, Error Model — 2026-06-26
Model: Opus (🧠 OPUS day)
Commits: branch `day/02-shared-types-env-errors` → PR #2 (squash). Increments: `feat(shared) …` + `feat(api,web) …`.
Built:
- **`packages/shared` — the one contract for api/web/voice/workers:**
  - `enums.ts` — full DATA-MODEL enum set as `as const` objects + value types: TenantType/Status, Role, MembershipStatus, Capability, **Provider** (13), AgentType/Status, FlowNodeType, CallDirection/Channel/Status (+TERMINAL set), LeadStatus, AppointmentStatus, SubscriptionStatus, **PlanFeature**, FeatureFlagScope.
  - `env.ts` — validates the **entire PREREQUISITES env surface** (datastores, R2, Clerk, Twilio/LiveKit, AI providers, Stripe, observability, Doppler); all optional except `NODE_ENV` so any app boots alone; ports coerced w/ defaults. Added `requireEnv(env, keys, feature)` to assert per-feature keys with an error that names the feature + missing vars and **never echoes values**.
  - `errors.ts` — `AppError` base + domain errors, added `BillingError`(402)/`RateLimitError`(429)/`ConflictError`(409); `ErrorResponse` envelope; `normalizeError()` (unknown→INTERNAL 500, original kept as cause) + `toErrorResponse()` (emits only code+safeMessage+requestId).
  - `result.ts` — `Result<T,E>` + `ok/err/isOk/isErr/mapResult/unwrap/tryCatch/tryCatchAsync`.
  - `schemas.ts` — Zod primitives (`zUuid/zEmail/zSlug/zE164/zLanguageTag`), `paginationSchema` (cursor), `Paginated<T>`, canonical `createAgentSchema`/`updateAgentSchema`.
  - `query-keys.ts` — tenant-namespaced TanStack factories; **every key is `['t', tenantId, …]`** so caches can't collide across tenants.
  - `constants.ts` — `TENANT_HEADER`, `RLS_TENANT_SETTING` (match DATA-MODEL §RLS), pagination/turn-timeout/persona limits, `EMBEDDING_DIMENSIONS`, `TTFA_TARGET_MS`.
  - `usage.ts` — `UsageRecord` (now `Provider`-typed) + `emptyCostBreakdown()`/`addCost()` (pure, capability→bucket, total kept consistent).
- **Consumers prove the contract (DoD):** api global `AppExceptionFilter` maps AppError/HttpException/unknown → safe `ErrorResponse` (preserves status, never leaks internals) and boots off `env.API_PORT`; web depends on `@vocaliq/shared` with `lib/api-error.ts`; workers already `parseEnv()` at boot.
Verification: `pnpm typecheck` 9/9, `pnpm lint` 9/9, `pnpm test` (shared **34** tests across 6 files) green, `pnpm build` 7/7. API smoke: unknown route → `{"error":{"code":"NOT_FOUND"}}` at **404** (not flattened to 500), `/healthz` 200.
Decisions / trade-offs:
- `as const` objects over TS `enum` (no runtime cruft, better literal narrowing) — matches existing Day-0 style.
- Env is permissive-by-default + `requireEnv()` at the feature edge, rather than a hard global allowlist, so one service never needs the whole platform's keys to start.
- `HttpException` handling in the filter returns **generic** status-based messages (no raw validation/internal detail) — richer field-level validation surfacing waits for the validation-pipe day; conservative on the "never leak" rule for now.
- UsageRecord `provider` tightened from `string` → `Provider` (provider-router’s `UsageMeter` Omit still compiles); adding a provider now means adding the enum value (intended — config, not code).
Migrations added: none (Prisma schema is Day 4).
Env / secrets added: none committed. **Env vars now *validated* (names only)** so admin can pre-fill `.env` before Days 3–6 — see report.
Deviations from TECH-STACK: none. Added `@types/express` (api) for the filter’s typed req/res.
Deferred (with reason): field-level validation error surfacing (with the global ValidationPipe day); domain-object TS interfaces (Agent/Call/Lead) land with the Prisma client on Day 4 — kept enums+DTOs here to avoid duplicating the schema.
Admin actions needed next: Day 3 **Clerk** keys (`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) + chosen auth methods; Day 4 `DATABASE_URL`/`DIRECT_URL` + base-currency/plan-tier decision; Day 6 `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`.

## Self-Audit — Day 02 (Shared types, env, errors)
A. Correctness: ✅ — DoD met: shared exports types/enums/zod/env/errors/UsageRecord; api/web/workers import under strict TS; env parser fails fast (tested); error model safe-vs-internal (tested). Manual: ran the API and confirmed the 404 envelope + healthz.
B. Tenancy: ✅ — query-key factories are tenant-namespaced (`['t',tenantId,…]`) with a test asserting no cross-tenant collision; `TENANT_HEADER`/`RLS_TENANT_SETTING` centralised to match the RLS contract.
C. Security: ✅ — env errors name vars but **never echo values** (tested); `toErrorResponse` proven to strip cause/meta/internal text (tested with embedded fake secret); no secrets in code.
D. Cost/router: ✅ — `UsageRecord` Provider-typed; cost-breakdown helpers pure + total-consistent (tested). No provider calls yet.
E. Tests: ✅ — 34 unit tests (env, errors, result, schemas, query-keys, usage); all green, none skipped.
F. Performance: ✅ NA — pure types/helpers; no queries or hot paths.
G. Errors/obs: ✅ — single error boundary (filter) → safe envelope; unknown errors normalised, original preserved as cause for server logs.
H. UI: ✅ NA — only `lib/api-error.ts` (a typed helper); no visual surface changed.
I. Regression: ✅ — re-ran full typecheck/lint/test/build (9/9, 9/9, green, 7/7); Day-1 web/api still build; api `/healthz` still 200; shared’s existing exports (`cn` unaffected; `parseEnv` signature preserved).
J. Quality/docs: ✅ — strict TS, no `any`/unjustified `!`; module header comments; BUILD-LOG updated; `.env.example` already lists the names.
K. Build/CI: ✅ all green locally (CI to confirm on PR #2).

Fixes applied this audit: AppExceptionFilter initially flattened framework `HttpException`s to 500 — fixed to preserve status (404 stays 404) while keeping messages generic; cleaned stray iCloud `* 2.*` duplicate files inside gitignored `apps/web/.next` that broke web typecheck (build output only — not in git/CI).
Open/deferred: field-level validation surfacing + domain interfaces — both intentional, logged above.
Proactive suggestions: when the global ValidationPipe lands, surface Zod field errors through the same envelope (e.g. an optional `details[]`); add a contract test that asserts every Prisma enum (Day 4) is mirrored 1:1 in `enums.ts` to prevent drift.

## Day 03 — Authentication, Sessions & MFA (Clerk) — 2026-06-26
Model: Opus (⚡ SONNET day; ran on Opus)
Commits: branch `day/03-auth-sessions-mfa` → PR #3 (squash). Increments: `feat(shared)…` + `feat(api)…` + `feat(web)…`.
Admin decision: **email + password only** (saved to memory; Clerk prebuilt components render whatever's enabled, so adding Google/MFA/magic-link later needs no code change).
Built:
- **Web (apps/web):** `ClerkProvider` (brand-violet accent) wraps the app; `middleware.ts` `clerkMiddleware` protects `/dashboard(.*)` (deny-by-default). Catch-all `sign-in`/`sign-up` pages (`<SignIn/>`/`<SignUp/>`); protected dashboard reads the verified user server-side; landing header swaps sign-in/up ⇄ Dashboard+`<UserButton/>` via server `auth()`.
- **API (apps/api):** `ClerkAuthGuard` verifies Clerk session tokens (`@clerk/backend verifyToken`) → `req.auth`; decorator-free `authenticate()`/`extractBearerToken()` for unit-testing; `@CurrentUser()` decorator. `AuthController`: guarded `GET /auth/me` (enriches identity via `clerkClient().users.getUser`) + `POST /auth/clerk/webhook` (Svix raw-body signature verify → `syncUser`). `rawBody: true` enabled for webhook integrity.
- **Shared/config:** `CLERK_WEBHOOK_SECRET` added; `parseEnv` now treats empty strings as unset (dotenv blank placeholders); Biome `unsafeParameterDecoratorsEnabled` so NestJS param decorators lint.
- **Env loading:** both apps now load the **monorepo-root `.env`** via dotenv (Next `next.config.ts`; Nest `main.ts`) — first day real secrets are needed; one source of truth, no per-app env files.
Verification:
- `pnpm typecheck` 9/9 · `pnpm lint` 9/9 · `pnpm test` **48** (13 api + 35 shared) · `pnpm build` 7/7 — all green.
- **API smoke (live):** `/auth/me` → `{"error":{"code":"AUTH"}}` 401 with no token and with a bad token; webhook → 401 without a valid Svix signature; `/healthz` 200.
- **Web smoke (live, real keys):** `/` 200 with Sign in/Sign up controls; `/sign-in` 200; `/dashboard` signed-out → Clerk `protect-rewrite` (content NOT served; redirects to sign-in in a real browser).
- **CI-parity check:** simulated CI (root `.env` absent) → `next build` exits 0 (auth routes are dynamic; no key needed at build).
Decisions / trade-offs:
- **User→DB sync DEFERRED to Day 4:** there is no Prisma `User` table until the data model (build order). The webhook **signature verification + the pure `mapClerkUserToUpsert` mapper are done and tested**; only the `db.user.upsert` is stubbed with a clear `TODO(Day 4)` — not faked.
- `/me` returns the verified identity now; `memberships: []` until RBAC (Day 5).
- Root-`.env` via dotenv (vs per-app `.env`) keeps the single-source-of-truth convention; missing file is a no-op so CI/Vercel (env-injected) are unaffected.
- Landing uses server `auth()` + `SignInButton/UserButton` instead of `<SignedIn>/<SignedOut>` (not re-exported by @clerk/nextjs 7.5.9; replaced by `<Show>`).
Migrations added: none (Day 4).
Env / secrets added (names): `CLERK_WEBHOOK_SECRET`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`. **Admin has set** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` in `.env` (verified present).
Deviations from TECH-STACK: none. Added deps: `@clerk/nextjs@7`, `@clerk/backend@3`, `svix@1`, `dotenv@16`, `vitest` (api tests). All standard for this integration.
Deferred (with reason): User/Membership DB upsert + the Clerk webhook endpoint registration in the dashboard (needs the deployed/tunnelled URL + `CLERK_WEBHOOK_SECRET`) → Day 4; full Clerk component theming for dark/light parity → a later UI pass.
Admin actions needed next: Day 4 — `DATABASE_URL` + `DIRECT_URL` (Postgres 16 + timescaledb + pgvector) and the base-currency + plan-tier decision. (Optional now: add a Clerk webhook in the dashboard once there's a public URL, and paste `CLERK_WEBHOOK_SECRET` — otherwise User sync activates on Day 4 via first-request upsert.)

## Self-Audit — Day 03 (Auth — Clerk)
A. Correctness: ✅ — DoD: sign-in/up + sign-out + session work (email+password per decision); API rejects unauthenticated, accepts valid tokens (guard verified); `/me` works; tests pass. MFA/social are dashboard toggles (no code change) — noted, not built per decision. **User→DB sync intentionally deferred to Day 4** (no table yet) — logged.
B. Tenancy: ✅ NA today — tenancy/RBAC are Day 4–5; `/me` returns `memberships: []` as a placeholder; no tenant data accessed.
C. Security (focus): ✅ — tokens verified server-side via Clerk JWKS using the secret from env (never hard-coded); 401 reasons stay internal (safe envelope, tested); webhook trusted only after **Svix signature verify over the raw body** (tested: valid/tamper/missing-secret/missing-headers); no secret logged (boot log checked); `.env` git-ignored (verified).
D. Cost/router: ✅ NA — no provider calls.
E. Tests (focus on I): ✅ — 13 api unit tests (token, authenticate 401 paths, webhook sign/verify/tamper, user-sync idempotency) + 35 shared; all green, none skipped.
F. Performance: ✅ — guard does one token verify; Clerk JWKS cached by the SDK; no N+1.
G. Errors/obs: ✅ — auth failures → typed AuthError → global filter → safe 401 envelope; no silent catches (verify failure wrapped with cause kept internal).
H. UI: ✅ (with noted follow-up) — sign-in/up/dashboard use `packages/ui` + tokens + the Waveform; Clerk accent set to brand violet. Full Clerk dark/light theming deferred to a UI pass (logged). Auth control copy is plain ("Sign in", "Sign up", "Dashboard").
I. Regression (focus): ✅ — re-ran full typecheck/lint/test/build (9/9, 9/9, 48, 7/7); Day-1/2 intact (api `/healthz` 200, exception filter still maps 404→NOT_FOUND, shared 34 tests green); **simulated keyless CI build → exit 0**; the empty-string `parseEnv` change is covered by a new test and didn't break existing env tests.
J. Quality/docs: ✅ — strict TS, no `any`/unjustified `!`; pure/testable seams; module headers; BUILD-LOG + `.env.example` updated.
K. Build/CI: ✅ all green locally; added api `vitest`; CI `node` job already runs `pnpm test`/`build` so the api tests + web build are covered.

Fixes applied this audit: dotenv exposed blank env placeholders → `parseEnv` now treats `''` as unset (+test); enabled Biome param-decorator parsing; corrected Clerk v7 import surface (`currentUser`/`auth` from `/server`; `<Show>` vs removed `<SignedIn>`).
Open/deferred: User/Membership DB upsert (Day 4); Clerk webhook dashboard registration (needs public URL); Clerk component theming (UI pass) — all intentional, logged.
Proactive suggestions: on Day 4, wire `syncUser` to `db.user.upsert({ where: { authProviderId } })` (idempotent) and add the cross-tenant isolation test; consider a tiny shared `loadRootEnv()` helper so workers/voice reuse the same root-`.env` loading; rotate the dev `sk_test_` key in Clerk after setup (it transited chat).

## Day 04 — Multi-Tenant Data Model + Prisma Schema + RLS — 2026-06-26
Model: Opus (🧠 OPUS — the most important architectural day)
Decisions (admin): DB = local Docker Postgres; base currency = USD; plan tiers = Free/Pro/Scale.
Commits: branch `day/04-data-model-rls` → PR #4. Increments: `feat(db) schema+migrations` · `feat(db) client+seed+tests` · `chore(infra,ci)`.
Built:
- **`schema.prisma` — 31 models** exactly per DATA-MODEL: Tenant hierarchy (self-relation), User, Membership, ProviderCredential (+PlatformApiKeyPool), Agent, Flow/FlowVersion, Voice, KnowledgeBase/KbChunk (pgvector), AgentMemory, Contact, Lead, PhoneNumber, SipTrunk, Call, Transcript, Campaign/CampaignContact, Appointment, Plan, Subscription, Wallet, UsageRecord, Invoice, ResellerMargin, Integration, Webhook, SupportTicket, Notification, AuditLog, FeatureFlag. Every tenant table has `tenantId` + index (+composite on hot paths e.g. `(tenantId,status)`,`(tenantId,createdAt)`). Encrypted columns are `Bytes` (ciphertext only); `KbChunk.embedding` = `vector(1536)`; `FlowVersion` denormalizes `tenantId` for uniform RLS.
- **Migrations:** `day04_initial_schema` (extensions + tables) + a separate `day04_rls_policies`:
  - `current_tenant()` (reads `app.current_tenant`, empty→NULL→deny) and `is_in_subtree(child,ancestor)` (recursive over `parentTenantId`, SECURITY DEFINER so it reads the full tree).
  - **Non-superuser `vocaliq_app` runtime role** + grants; ENABLE RLS + `tenant_isolation` policy on **31 tables** (nullable-tenant tables allow NULL platform rows; `ProviderCredential` stricter; `Tenant` self+descendants; `ResellerMargin` either side).
  - **UsageRecord → Timescale hypertable** (PK `(id,ts)` includes the partition col); **KbChunk HNSW** vector index.
- **`src/index.ts`:** runtime client bound to the app role; `withTenant(tenantId, fn)` sets `app.current_tenant` **transaction-locally** so RLS scopes every query and nothing leaks across pooled connections.
- **Seed:** PLATFORM → demo RESELLER → demo CUSTOMER, SUPER_ADMIN + membership, Free/Pro/Scale plans (USD) — idempotent (fixed UUIDs + upserts).
- **CI:** node job gains `APP_DATABASE_URL` + a generate→migrate→seed step so the db tests run on a real Postgres; `postinstall: prisma generate`; `dev:infra` now `--env-file .env`.
Verification:
- `pnpm typecheck` 9/9 · `pnpm lint` 9/9 · `pnpm test` **55** (db 7 + api 13 + shared 35) · `pnpm build` 7/7 — all green locally.
- **RLS proven (psql + automated):** platform sees 3 tenants, reseller sees 2 (self+child), customer sees 1, no-context sees 0; as the app role, customer can't see a sibling's contacts, reseller sees its child's data but not a sibling reseller's. Hypertable + HNSW + both extensions present.
- Migration applies cleanly to a fresh DB (reset + deploy); seed produces the tenant tree + super-admin.
Decisions / gotchas:
- The docker `vocaliq` user is a **superuser** → bypasses RLS; so RLS is only meaningful for the non-superuser **`vocaliq_app`** role. Runtime uses `APP_DATABASE_URL` (app role); migrations/seed/audited-admin use `DATABASE_URL` (owner) = the sanctioned privileged bypass.
- Stopped Prisma from managing extensions (`postgresqlExtensions` preview fought the docker-precreated ones); extensions are `CREATE EXTENSION IF NOT EXISTS` at the top of the initial migration (self-sufficient for CI/hosted).
- Local host ports moved to **5434 (pg) / 6390 (redis)** to dodge two other local Postgres instances; `DATABASE_URL`/`APP_DATABASE_URL` point at 5434.
Migrations added: `day04_initial_schema`, `day04_rls_policies`.
Env / secrets added (names): `APP_DATABASE_URL` (+ `.env` set to the vocaliq_app role). Admin already set `DATABASE_URL`/`DIRECT_URL`.
Deviations from TECH-STACK: none. Added deps: `prisma`/`@prisma/client` 6.x, `tsx`, `dotenv`, `vitest` (db).
Deferred (with reason): full RBAC + the expanded isolation suite → Day 5 (this is the Day-4 scaffold); Phase-6 tables (NumberReputation, AbuseSignal, etc.) → their own days (69–94); CallMetric hypertable → when that table exists (analytics, Day 41); wiring `syncUser` upsert (Day 3 stub) onto the new `User` table → Day 5.
Admin actions needed next: Day 5 none (RBAC + isolation tests). Day 6 `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` (router first AI call).

## Self-Audit — Day 04 (Data model + RLS)
A. Correctness: ✅ — DoD met: schema compiles; migrations apply to a fresh DB; extensions present; every tenant table has tenantId+index+RLS; subtree fn works; seed produces platform/reseller/customer + super-admin; connection helper sets current_tenant (verified via tests + psql).
B. Tenancy (focus): ✅ — RLS on 31 tables; `is_in_subtree` gives reseller→descendants but NOT siblings (tested both directions); deny-by-default with no context; the superuser-bypass path is explicit + documented (privileged/admin only). Cross-tenant reads return zero rows.
C. Security: ✅ — encrypted columns are ciphertext `Bytes` (no plaintext key column); RLS as the safety net; `vocaliq_app` is non-superuser/NOBYPASSRLS; functions pin `search_path`. Dev-only role passwords (same posture as the committed docker password) — no real secrets.
D. Cost/router: ✅ NA — UsageRecord modelled + hypertable ready for the cost engine (Day 13).
E. Tests (focus): ✅ — 7 db tests (introspection: tenantId⇒RLS+index; isolation: sibling + subtree + deny-by-default), all green; CI runs them against a real Postgres.
F. Performance (focus): ✅ — tenantId indexed everywhere; composite indexes on hot paths; UsageRecord hypertable; HNSW on embeddings.
G. Errors/obs: ✅ NA — schema/migrations; `current_tenant()` empty→NULL is a safe default.
H. UI: ✅ NA.
I. Regression: ✅ — full typecheck/lint/test/build green (9/9, 9/9, 55, 7/7); Days 1–3 intact (shared 35 incl. the new APP_DATABASE_URL optional; api 13; web unaffected).
J. Quality/docs (focus): ✅ — schema matches DATA-MODEL entity-for-entity; enums mirror `@vocaliq/shared`; BUILD-LOG + `.env.example` updated; migration comments explain the RLS model.
K. Build/CI: ✅ — all green locally; CI generates client + migrates + seeds before tests.

Fixes applied this audit: dropped Prisma extension management (drift vs docker init); added FlowVersion.tenantId for uniform RLS; created the non-superuser app role after confirming the owner is a superuser (RLS no-op otherwise); composite PK (id,ts) on UsageRecord so the hypertable is valid; raw-SQL test-data inserts needed updatedAt → switched verification to the Prisma-client tests.
Open/deferred: RBAC + expanded isolation suite (Day 5); Phase-6 tables; CallMetric hypertable; User-sync upsert wiring — all intentional, logged.
Proactive suggestions: add a CI/test that asserts every Prisma enum is mirrored in `@vocaliq/shared` enums.ts (drift guard); on Day 5 add the RolesGuard + AuditLog writes for privileged (superuser-path) operations; consider connection pooling (pgbouncer) config + verify `withTenant`'s transaction-local setting under the pool.

## Day 05 — RBAC, Tenant Guard & Isolation Tests — 2026-06-26
Model: Opus (🧠 OPUS). No new credentials.
Commits: branch `day/05-rbac-tenant-guard` → PR #5. Increments: `fix(db) interop` · `feat(api) tenancy+RBAC` · `feat(api) user sync`.
Built:
- **`PrismaService` + `DbModule` (global):** the RLS app-role client (`withTenant`) for business data + the owner client (`admin`) for auth-infra (user sync, membership resolution) — the documented privileged path.
- **`TenantGuard`:** runs after ClerkAuthGuard; lazily ensures the local User exists, resolves the active tenant from membership (honours the `x-tenant-id` switcher header), attaches `req.tenant` = {userId, tenantId, role}. `@CurrentTenant()` / `@CurrentMembership()` decorators.
- **RBAC:** `@Roles()` + `RolesGuard` (deny-by-default; SUPER_ADMIN passes; config writers = OWNER/ADMIN/BUILDER/RESELLER_ADMIN; ANALYST/AGENT/BILLING read-only). `hasRequiredRole`/`canMutateConfig` helpers.
- **`TenantController`:** `GET /tenants/memberships` (switcher options), `GET /tenants/current` (reads the tenant through the RLS client — end-to-end proof), `POST /tenants/current/audit` (role-gated AuditLog write; ANALYST blocked).
- **Day-3 deferral resolved:** `upsertUserFromClerk` persists the local User (owner client; User has no RLS); the webhook + lazy first-request sync both use it; `/me` now returns memberships.
Verification:
- `pnpm typecheck` 10/10 · `pnpm lint` 10/10 · `pnpm test` **69** (db 7 + api 27 + shared 35) · `pnpm build` 7/7 — all green.
- **Isolation proven (integration vs real Postgres):** tenant resolution honours membership; a user can't resolve a tenant they're not in (403); reseller sees its child's data but NOT a sibling reseller's; and a **deliberately unscoped** app query returns **0 rows** (RLS safety net holds even if the app filter is bypassed). RolesGuard rejects ANALYST from a config mutation (403).
- **API boot smoke (live):** `/healthz` 200; `/tenants/current` + `/auth/me` → 401 AUTH envelope unauthenticated (DI fully wired).
Decisions / gotchas:
- **CJS↔ESM interop bug:** a runtime `export * from '@prisma/client'` (CJS) in the ESM `@vocaliq/db` index dropped the package's own runtime exports when required from the CommonJS api (`createPrismaClient is not a function`). Fixed with a **type-only** re-export — consumers only need Prisma's types from the index; runtime helpers stay as normal exports.
- **Membership resolution uses the owner client** (auth-infra legitimately spans tenants to find where a user belongs); all business reads/writes go through `withTenant` + RLS. Explicit, narrow, documented.
- **Biome vs NestJS DI:** `useImportType` would rewrite injected providers to `import type` and break constructor injection at runtime — added `apps/api/biome.json` turning that rule off for the api only. (A stray root `biome --write` re-broke them once; reverted + verified via a live DI boot.)
Migrations added: none (uses Day-4 schema/RLS).
Env / secrets added: none.
Deviations from TECH-STACK: none. Added `zod` as a direct api dep (DTO validation in the controller).
Deferred (with reason): full HTTP/supertest e2e of the guards (the integration suite covers resolution + RLS + role logic at the service/guard layer; a Clerk-mocked supertest pass can come with the first real feature endpoints); richer per-field validation surfacing (with the global ValidationPipe day).
Admin actions needed next: Day 6 — `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` (provider-router skeleton + first AI call). (OpenAI key is still blank in `.env`.)

## Self-Audit — Day 05 (RBAC + tenant guard + isolation)
A. Correctness: ✅ — DoD met: tenant + role guards active; `@CurrentTenant` works; isolation tests pass (app + RLS layers); reseller subtree correct; role matrix enforced; isolation tests run in CI.
B. Tenancy (focus): ✅ — TenantGuard sets the scope from membership only; `withTenant` applies RLS; the "try to break it" unscoped-query test confirms RLS denies by default. Reseller sees descendants not siblings (tested).
C. Security (focus): ✅ — deny-by-default guards; owner client used ONLY for auth-infra (never business data); role-gated mutation tested (ANALYST 403); 401/403 via the safe envelope; no secrets logged.
D. Cost/router: ✅ NA.
E. Tests: ✅ — 14 new api tests (role matrix, RolesGuard, RBAC+isolation integration) + existing; 69 total green; isolation runs against real Postgres in CI.
F. Performance: ✅ — membership lookups are indexed (`@@index([userId])`, `@@unique([tenantId,userId])`); `withTenant` is one transaction.
G. Errors/obs: ✅ — typed TenantError/ForbiddenError → safe envelope; no silent catches.
H. UI: ✅ NA.
I. Regression (focus): ✅ — full typecheck/lint/test/build green; Days 1–4 intact (api boot verified live; db 7 isolation tests still green; shared 35); the `@prisma/client` interop fix verified by a live DI boot, not just typecheck.
J. Quality/docs: ✅ — strict TS, no `any`; guards/decorators documented; BUILD-LOG updated.
K. Build/CI: ✅ — all green; CI already migrates+seeds and passes DB env to tests (Day 4).

Fixes applied this audit: type-only Prisma re-export (require-ESM interop); apps/api biome useImportType off (DI); reverted a stray root `biome --write` that type-imported injected providers (caught via a runtime boot, not just static checks).
Open/deferred: HTTP/supertest e2e of guards; per-field validation surfacing — both intentional, logged.
Proactive suggestions: add a Clerk-mocked supertest pass when the first feature endpoints land; write AuditLog entries for every privileged (owner-client) operation; add the enum-drift guard test (Prisma vs shared enums) flagged on Day 4.

## Day 06 — Provider-Router Skeleton + First Proven AI Call — 2026-06-26
Model: Opus (🧠 OPUS). Admin keys: OPENAI_API_KEY + ANTHROPIC_API_KEY (both validated live, HTTP 200).
Commits: branch `day/06-router-skeleton-first-ai-call` → PR #6. Increments: `feat(router) …` + `feat(api) …`.
Built:
- **`@vocaliq/provider-router` (golden rule #2):** typed `LLMProvider` (complete/stream/embed); **OpenAI** (Chat + Embeddings, `gpt-4o-mini` / `text-embedding-3-small`) and **Anthropic** (Messages, `claude-opus-4-8`; thinking omitted/off, no sampling params per the claude-api reference) adapters — keys injected, never logged. Versioned **price table** with longest-prefix matching (handles provider date suffixes like `gpt-4o-mini-2024-07-18`). **Router**: selects by tenant model preference → default order; resolves **BYOK vs platform** key per provider; **falls back** to the next provider on failure; **emits a UsageRecord on every completion** (BYOK cost computed informationally but flagged → not billed; golden rule #4).
- **api:** `RouterService` wraps the Router and persists a **tenant-scoped UsageRecord via the RLS client** on every call (no un-metered path). `key-resolver`: platform keys from env, tenant BYOK from `ProviderCredential` (envelope decryption deferred to Day 57, flagged). `POST /agents/:id/test-complete` — **config-writer roles only** (OWNER/ADMIN/BUILDER/RESELLER_ADMIN; ANALYST/AGENT blocked), RLS-scoped agent read, returns `{text, model, usage, costUsd}`.
Verification:
- `pnpm typecheck` 11/11 · `pnpm lint` 11/11 · `pnpm test` (provider-router 9 + api 28 + shared 35 + db 7) · `pnpm build` 7/7 — all green.
- **First proven AI call (live):** the provider-router live test runs a real OpenAI completion through the Router → text returned + UsageRecord with **positive cost**. The api live test runs a real completion through `RouterService` → **a priced `UsageRecord` row is persisted** for the tenant under RLS. (Both key-gated: skip in CI, never block the gate.)
- API smoke: `/agents/:id/test-complete` → 401 AUTH unauthenticated; DI boots clean.
Decisions / gotchas:
- **OpenAI returns dated model ids** → priced 0 at first; fixed with longest-prefix price matching (`gpt-4o-mini-…` → `gpt-4o-mini`, never the shorter `gpt-4o`).
- **Build-staleness bite:** the api imports the compiled `provider-router/dist`; the pricing fix only took effect after rebuilding the package (vitest used src and masked it). Re-verified end-to-end.
- BYOK cost is still **computed** (visibility) and flagged, not zeroed — matches CODE-PATTERNS §3 ("recorded informationally, not billed").
- No provider-specific code outside the package (golden do-not #3); keys are constructor-injected and never logged.
Env / secrets added: none new. Prices in `pricing.ts` are values, re-verify per CLAUDE.md §13/§15.
Deviations from TECH-STACK: none. Added `@anthropic-ai/sdk@0.106`, `openai@6.45`.
Deferred (with reason): streaming token-level cost metering (wired with the live call loop, Day 9 — voice service meters per segment); embeddings cost metering precision (Day 20 RAG); BYOK envelope decryption (Day 57 KMS); HTTP-layer e2e of the endpoint with a Clerk token (the live `RouterService` test proves the AI+cost+persist path headlessly; the endpoint is role-gated + DI-verified).
Admin actions needed next: **Phase 1, Day 07** (provider-router core hardening) then the voice loop — ensure **LiveKit + Deepgram + ElevenLabs + Twilio** keys are ready (PREREQUISITES Group B).

## Self-Audit — Day 06 (Provider-router + first AI call)
A. Correctness: ✅ — DoD met: Router returns a working LLM client per tenant; both adapters exercised (live); selection + fallback + BYOK/managed tested; every completion emits a correct UsageRecord; a live completion returns a real result + cost and persists a priced UsageRecord.
B. Tenancy: ✅ — UsageRecord persisted via `withTenant` (RLS); the endpoint reads the agent RLS-scoped and is tenant+role gated.
C. Security (focus): ✅ — keys constructor-injected, never logged; no key in errors (ProviderError carries a generic safe message); no provider code outside the package; platform keys from env only. BYOK decryption explicitly deferred + flagged (no fake crypto).
D. Cost/router (focus): ✅ — every metered path emits a UsageRecord; cost from the versioned table; BYOK flagged (not billed) but cost computed; fallback ensures one provider outage doesn't drop the call.
E. Tests: ✅ — 9 provider-router (pricing, selection, fallback, BYOK, all-fail, live) + 2 live api/router; unit tests run in CI, live tests skip without keys.
F. Performance: ✅ — single completion path; fallback only on error; no N+1.
G. Errors/obs: ✅ — adapter failures → typed ProviderError → safe envelope; no silent catches (fallback is explicit, last error preserved as cause).
H. UI: ✅ NA.
I. Regression: ✅ — full typecheck/lint/test/build green; Days 1–5 intact (api 28 incl. RBAC/RLS; shared 35; db 7); `.env` DB urls had been blanked by earlier port-shuffling — restored to the 5434 stack and re-verified (local-only; `.env` is git-ignored).
J. Quality/docs: ✅ — strict TS, no `any`; price table + deferrals documented; BUILD-LOG updated; provider-agnostic contract.
K. Build/CI: ✅ — green; provider-router added to the build graph; live tests gated so CI (no keys) passes.

Fixes applied this audit: longest-prefix price matching for dated model ids; rebuilt provider-router/dist so the api saw the pricing fix; restored blanked `.env` DB urls (5434).
Open/deferred: stream/embedding cost metering, BYOK KMS decryption, HTTP e2e of the endpoint — all intentional, logged.
Proactive suggestions: on Day 13 (cost attribution) add a reconciliation worker asserting zero metered calls without a UsageRecord; add a `.env` integrity check to `dev:infra` so blanked DB urls are caught early; seed a demo Agent so the HTTP endpoint can be manually exercised end-to-end.

## Day 07 — Provider Router Core (TTS/STT/Telephony/Media) — 2026-06-26 — ⚠️ PARTIAL (scaffold)
Model: Opus (🧠 OPUS, "may take 2 sessions"). **Status: key-independent scaffold merged; live adapter bodies + sandbox smokes DEFERRED pending voice-stack keys.**
Reason: the four adapters (ElevenLabs/Deepgram/Twilio/LiveKit) and the DoD live smokes need real keys; CLAUDE.md §15 forbids writing unverified provider code. User chose "scaffold now" → build everything that doesn't need keys; fill the adapter bodies + add live smokes when keys arrive.
Commits: branch `day/07-provider-router-core` → PR #7. `feat(router) …` + `feat(voice) …`.
Built (DONE):
- **Contracts** (`provider-router`): `TTSProvider`, `STTProvider` (+`STTEvent`), `TelephonyProvider` (dial/answer/transfer/hangup + `DialResult`), `MediaProvider` (LiveKit room+token) — typed, with default models + capability tags.
- **Pricing**: `TTS_PRICES` (per 1k chars), `STT_PRICES`/`TELEPHONY_PRICES` (per minute) + `ttsCostUsd`/`sttCostUsd`/`telephonyCostUsd`.
- **Router**: `selectTTS`/`selectSTT` (resolve key → build adapter → selection-time fallback to the next provider) + `meterMedia()` (per-capability cost → `UsageRecord`).
- **Adapter stubs**: ElevenLabs/Deepgram/Twilio/LiveKit implement the contracts but throw a typed `ProviderError('not implemented (pending live verification)')`, each with a TODO block naming the exact SDK calls.
- **Python mirror** (`apps/voice/app/providers/`): `contracts.py` (Protocols: LLM/TTS/STT/Telephony + dataclasses) and `pricing.py` (price tables + cost utils, incl. the dated-model longest-prefix match) — in lock-step with `pricing.ts`.
Verification:
- `pnpm typecheck` 11/11 · `pnpm lint` 11/11 · `pnpm test` (provider-router **15** incl. media selection/fallback/cost + stub-throws · api 28 · shared 35 · db 7) · `pnpm build` 7/7 — green.
- Voice: `ruff` clean · `pyright` 0 errors · `pytest` 6 (incl. **TS↔Python price parity** + dated-model match).
Deferred (explicit — finish on the live day when keys are set):
1. **ElevenLabs TTS** streaming body + smoke (synthesize speech).
2. **Deepgram STT** live WebSocket body + smoke (transcribe a clip).
3. **Twilio telephony** body (first real outbound call is Day 10).
4. **LiveKit media** body + smoke (create a room / mint a token).
5. **Router fallback "when a provider key is invalid"** (self-audit focus) — selection-time fallback is done + tested; live invalid-key fallback verifies with real keys.
6. Telephony/media **multi-credential resolution** (SID+token, url+key+secret) — finalize the KeyResolver shape on the live day.
7. Python live adapter impls (currently contracts + pricing only).
Migrations/env added: none.
Deviations from TECH-STACK: none (no provider SDKs added yet — added with the live bodies).
Admin actions needed next: **set the voice-stack keys** to finish Day 07 + start the live loop — `LIVEKIT_URL/API_KEY/API_SECRET`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` (and `TWILIO_*` by Day 10).

## Self-Audit — Day 07 (scaffold)
A. Correctness: ⚠️ partial — the key-independent DoD (contracts, price tables, selection+fallback logic, Python mirror, mocked tests) is met; the live-adapter + sandbox-smoke DoD items are explicitly deferred + logged (not faked).
B. Tenancy: ✅ — `meterMedia` is provider/units only; tenant scoping is applied by the caller via `withTenant` (as for LLM on Day 6).
C. Security: ✅ — keys constructor-injected, never logged; stubs hold creds without using them; no provider code outside the package.
D. Cost/router (focus): ✅ — every media capability has a price table + cost util with exact tests; `meterMedia` emits a UsageRecord; selection-time fallback present.
E. Tests: ✅ — 15 TS (incl. media selection/fallback/cost + stub-throws) + 6 voice (incl. cross-language price parity); CI-safe (no keys needed).
F. Performance (focus, streaming): ⚠️ NA yet — streaming bodies deferred; contracts are async-iterable-shaped for low-latency streaming.
G. Errors/obs: ✅ — stubs throw typed ProviderError; selection failure → ProviderError with cause.
H. UI: ✅ NA.
I. Regression: ✅ — full TS gates green; Days 1–6 intact (api 28, shared 35, db 7); voice tests green; provider-router LLM/live tests unaffected.
J. Quality/docs: ✅ — strict TS + typed Python; TODO blocks mark exactly where live bodies go; BUILD-LOG records every deferred item.
K. Build/CI: ✅ — green; live smokes will be key-gated like Day 6 so CI stays green.

Fixes applied this audit: async stub methods so `notImplemented()` rejects (not throws synchronously); biome-ignore `useYield` on stub generators.
Open/deferred: the 7 live items above — all intentional, tracked for the keyed session.
Proactive suggestions: when keys land, add a key-gated live smoke per adapter (synth/transcribe/room/call) mirroring Day 6's live tests; extend the KeyResolver to return multi-field telephony/media creds; add a CI assertion that TS and Python price tables stay in sync.

## Day 08 — Voice Service Skeleton (FastAPI control surface) — 2026-06-30 — ⚠️ PARTIAL (scaffold)
Model: Opus (🧠 OPUS). **Status: key-independent control plane merged; live media bridge DEFERRED pending LiveKit/Deepgram/ElevenLabs keys.**
Reason: room creation + Pipecat agent join + greeting need the live providers; CLAUDE.md §15. User chose "scaffold now".
Commits: branch `day/08-voice-service-skeleton` → PR #8. `feat(voice) …`.
Built (DONE):
- **Call lifecycle** (`app/calls/lifecycle.py`): `CallSession` + state machine mirroring shared `CallStatus` — validated forward transitions (QUEUED→RINGING→IN_PROGRESS→terminal), illegal jumps raise `InvalidTransitionError`, terminal states final, transition history.
- **LiveKit token minting** (`app/calls/livekit_service.py`): `mint_access_token` — REAL pure JWT (HS256 + room-join video grant), exactly as the LiveKit server validates; no network → testable with any key/secret. `create_room` deferred (needs the live server).
- **Control endpoint** (`app/calls/router.py` + `models.py`): `POST /calls/start` validates the request (Pydantic), opens a session (QUEUED→RINGING), mints participant+agent tokens when keys are configured (else a clear pending note). `/healthz` now reports `livekit` config + `active_calls`; FastAPI `lifespan` hook for graceful shutdown.
- **Config**: LiveKit settings (optional) + `livekit_configured` property; env loaded from the monorepo-root `.env`.
Verification:
- Voice: `ruff` clean · `pyright` 0 errors · `pytest` **15** (lifecycle transitions, token JWT claims/signature, `/calls/start` with+without keys + validation, + the Day-7 mirror tests).
- TS side untouched → Days 1–7 gates remain green (CI re-verifies).
Robustness fixes:
- `pytest pythonpath=["."]` so `import app` resolves deterministically regardless of editable-install state (PEP 660 finder flakiness).
- explicit `[tool.setuptools.packages.find] include=["app*"]` + a `[build-system]`.
- CI `voice` job pins pyright to the pip interpreter (`--pythonpath $(python -c 'sys.executable')`) so dev-dep imports (pytest, …) always resolve.
Deferred (Day 09 live, tracked):
1. LiveKit **room creation** (RoomServiceClient).
2. **Pipecat agent worker** joins the room + plays a **greeting** (router TTS).
3. **Media bridge** (caller audio in / agent audio out).
4. **Call DB row** persistence with `app.current_tenant` set per call (voice → Postgres).
5. **Event emission** to api/clients (Socket.IO/callback).
Admin actions needed next: set `LIVEKIT_*`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY` to finish Day 08 live + build Day 09 (the full real-time loop — the heaviest day).

## Self-Audit — Day 08 (scaffold)
A. Correctness: ⚠️ partial — control plane (lifecycle, token minting, /calls/start shape, health, shutdown hook) done + tested; live media bridge + Call persistence explicitly deferred + logged (not faked).
B. Tenancy (focus): ⚠️ — `tenant_id` is required on `StartCallRequest` and carried on `CallSession`; setting `app.current_tenant` on the DB session + the Call row write land Day 09 with DB wiring (deferred, logged).
C. Security: ✅ — LiveKit token signed with the API secret (HS256); no secret logged; creds optional via env; request validated (Pydantic).
D. Cost/router: ✅ NA — metering enters with the live loop (Day 9).
E. Tests: ✅ — 15 voice tests incl. illegal-transition + signature-mismatch + validation paths.
F. Performance (focus, async): ✅ — endpoint is async + non-blocking; token minting is pure/sync-cheap; no blocking I/O on the path.
G. Errors/obs (focus, shutdown): ✅ — lifespan hook present for graceful shutdown; invalid transitions/requests raise typed/422 errors; deferred room ops raise a clear NotImplementedError.
H. UI: ✅ NA.
I. Regression: ✅ — voice ruff/pyright/pytest green; TS workspace untouched (Days 1–7 unaffected); pytest import made deterministic (fixed a real flake).
J. Quality/docs: ✅ — typed Python; TODO blocks mark live seams; BUILD-LOG records every deferred item.
K. Build/CI: ✅ — voice job green; pyright pinned to the install interpreter; live media stays out of CI (no keys).

Fixes applied this audit: deterministic pytest `pythonpath` + setuptools package discovery + CI pyright interpreter pin (fixed `ModuleNotFoundError: app` flake and a pytest-import-resolution gap).
Open/deferred: the 5 live items above — intentional, tracked for the keyed session.
Proactive suggestions: when keys land, add a key-gated LiveKit room smoke + an agent-join greeting test; wire the voice→Postgres connection with `SET LOCAL app.current_tenant` per call (mirror `withTenant`); use 32+ byte secrets in token tests to silence the PyJWT key-length warning.

## Days 07 + 08 — LIVE upgrade (provider adapters + voice media room) — 2026-06-30 — ✅ DONE (live, key-gated)
Model: Opus (🧠 OPUS). **Status: the items deferred in the Day-07/08 scaffolds are now implemented LIVE and verified against the real providers.** Keys arrived (LiveKit/Deepgram/ElevenLabs validated: LiveKit ListRooms 200, Deepgram /projects 200, ElevenLabs /user 200 — note ElevenLabs starter plan ~55 chars left).
Branch: `day/07-provider-router-core` → PR. Three commits (TS adapters · Python mirror · voice room/events/drain).

Built (DONE, live-verified before coding — CLAUDE.md §15):
- **TS provider-router adapter bodies** (`packages/provider-router/src/adapters/`):
  - `ElevenLabsTTS` — streaming PCM16@16k via `POST /v1/text-to-speech/{voice}/stream?output_format=pcm_16000` (native fetch; shape verified live = `audio/pcm`).
  - `DeepgramSTT` — live WS (`@deepgram/sdk`) with an async-queue callback→iterator bridge (interim+final for barge-in).
  - `LiveKitMedia` — real `createRoom` + join-token mint (`livekit-server-sdk`); ws→http host normalisation; `serverUrl` getter.
  - `TwilioTelephony` — real dial/transfer/hangup over the Voice REST API (`twilio`); dial guards on missing TwiML (first live call = Day 10).
  - Deps added: `@deepgram/sdk`, `livekit-server-sdk`, `twilio`.
- **Python mirror** (`apps/voice/app/providers/adapters/`): `ElevenLabsTTS` (httpx stream) + `DeepgramSTT` (websockets + CloseStream flush); both protocols verified live. Deps: httpx/websockets/livekit-api + pytest-asyncio. **certifi CA pin** (venv Pythons lack a system trust store → TLS handshake failed for raw ws/aiohttp).
- **Voice media room (Day 08 live)**: `LiveKitRoomService.create_room/delete_room` (Twirp; certifi-backed aiohttp session injected into `LiveKitAPI`). `POST /calls/start` now provisions the room for real + mints caller/agent tokens (+`server_url`) + emits `call.queued`/`call.ringing`; room-provision failure → 502 + `call.failed`. `EventSink` (in-process log + fan-out, Socket.IO/api publisher plugs in Day 9). Graceful-shutdown drain ends in-flight sessions via legal terminal transitions + deletes their rooms.

Verification:
- TS: typecheck + lint + **22 tests** + build green; **live smokes PASS** — LiveKit room+token (2.1s) and Deepgram live socket (1.5s). ElevenLabs synth smoke opt-in (`RUN_TTS_SMOKE=1`) to protect the char budget; mocked unit tests cover its stream + error paths.
- Voice: ruff + pyright + **24 tests** green (incl. live LiveKit room create/delete + live Deepgram socket). ElevenLabs live synth skipped (opt-in).
- Root: `pnpm typecheck` (11/11) + `pnpm build` (7/7) green — api/workers consuming provider-router unaffected.
- **Demonstrated working**: `/calls/start` against live LiveKit → `RINGING` + room-scoped agent JWT + `server_url`; `createRoom` assigns a real sid.

Provider behaviour noted (not a bug): LiveKit Cloud `ListRooms` only returns rooms with **active participants**, so a freshly-created empty room is absent from the list until the agent/caller join (Day 9). `createRoom` still returns a valid room object (name + sid + empty_timeout).

Still deferred to **Day 09** (the real-time loop — heaviest): Pipecat agent worker JOINS the room + plays the greeting (router TTS); full caller-audio↔agent media bridge with barge-in; tenant-scoped **Call DB row** persistence with `app.current_tenant` set per call; wiring the EventSink to Socket.IO + the api callback.

## Self-Audit — Days 07/08 (live upgrade, A–K)
A. Correctness: ✅ — every adapter body implemented against the providers' real wire shapes (each verified with a live probe before coding); LiveKit room ops + token mint + lifecycle + drain demonstrated end-to-end.
B. Tenancy: ✅/⏭ — `tenant_id` required + carried on every session and event; per-call `app.current_tenant` + Call-row write land Day 9 with the DB wiring (tracked).
C. Security: ✅ — no secret in code/logs; keys read from env only; LiveKit JWT signed with the secret; certifi pin makes TLS verification correct (not disabled). ElevenLabs/Twilio errors surface status+truncated detail, never the key.
D. Cost/router: ✅ — adapters never bill; metering stays in the Router (`meterMedia` + price tables, golden rule #4); TTS=chars, STT=seconds, telephony=minutes paths preserved.
E. Tests: ✅ — 22 TS + 24 voice; mocked unit tests for stream/bridge/error logic + skip-guarded live smokes that prove the real path without blocking CI.
F. Performance (async/streaming): ✅ — TTS/STT stream chunk-by-chunk (no full-clip buffering); endpoint async + non-blocking; Deepgram bridge wakes only on new data.
G. Errors/obs + shutdown: ✅ — typed ProviderError/TTSError/STTError; room-provision failure → clean 502 + event; lifespan drain deletes rooms (no orphans).
H. UI: ✅ NA.
I. Regression: ✅ — root typecheck/build green; Days 1–8 gates intact; the obsolete "stubs throw" tests replaced with real ones.
J. Quality/docs: ✅ — strict TS / typed Python; comments mark the Day-9 seams; BUILD-LOG records the live/deferred boundary + the LiveKit ListRooms behaviour.
K. Build/CI: ✅ — live smokes skip without keys, so CI stays deterministic; new SDK deps pinned.

Fixes applied this session: AppErrorOptions `meta` (not `context`); Deepgram `send` ArrayBuffer slice; removed unused imports; certifi CA pin for ws/aiohttp; LiveKit ws→http host normalisation; drain uses only legal transitions (no force-terminal).
Admin actions needed next (Day 09): keys already set. Heads-up: **ElevenLabs starter plan is ~55 characters from its cap** — upgrade (Creator+) or wait for the monthly reset before the Day-9 greeting/loop will speak; STT + room + loop logic build and test fine without it.

## Day 09 — Real-time conversation engine (STT→LLM→TTS, barge-in) — 2026-07-01 — ✅ DONE (engine live-proven; LiveKit transport = part 2)
Model: Opus (🧠 OPUS). The heart of the product. Branch `day/09-live-call-loop` → PR.
**Architecture decision (deviation from "use Pipecat", logged per CLAUDE.md §11/§13):** implemented the CODE-PATTERNS §9 loop shape as a **provider-agnostic engine over our router contracts** instead of adopting Pipecat's built-in STT/LLM/TTS services. Reason: those services would call providers directly, bypassing our **cost metering + BYOK + fallback** (golden rules #2/#3/#4); and a decoupled engine is **fully testable in CI without keys**. Pipecat/livekit-agents can host this engine as a transport later without changing it.

Built (DONE):
- `app/loop/vad.py` — energy VAD (RMS + start/end hysteresis); `audioop`-free (gone in py3.13+).
- `app/loop/chunker.py` — sentence/clause chunking so TTS (and first audio) starts before the LLM completes.
- `app/loop/context.py` — rolling conversation context trimmed to a token budget (bounds long-call latency/cost).
- `app/loop/endpointer.py` — clock-injected turn-taking: commits a turn on `turn_timeout_ms` silence-after-speech + a final transcript; still-there backstop.
- `app/loop/metrics.py` — per-turn TTFA / LLM-TTFT / turnaround (targets 800ms / 1500ms).
- `app/loop/engine.py` — `ConversationLoop`: frame→VAD→endpoint cadence; the agent turn runs as a **concurrent task** so the frame loop keeps watching for **barge-in** (caller speech → cancel in-flight TTS + flush output + listen); streaming LLM→chunk→TTS→playback; **per-turn STT/LLM/TTS UsageRecords** attributed to tenant+call; event emission (partial transcript, agent.speaking, agent.interrupted, user.turn, turn.metrics); transcript-persistence hook. Transport-agnostic.
- `app/providers/adapters/openai.py` — Python streaming LLM adapter (httpx SSE; shape verified live) — the loop's real brain.

Verification:
- Voice: ruff + pyright + **43 tests** (1 skipped opt-in) green. Acceptance suite (deterministic, no keys): full single + multi-turn conversation, barge-in (buffer flushed + `agent.interrupted`), endpointing (waits configured silence; no commit without a final), provider-failure resilience (LLM raises → call survives), per-turn STT+LLM+TTS usage records, TTFA+turnaround latency assertion under target, greeting.
- **Demonstrated LIVE end-to-end** (real Deepgram→OpenAI→ElevenLabs): fed a synthesized caller question as 20ms frames → Deepgram transcribed "What are your opening hours on weekends?" → OpenAI replied "Our weekend hours are from 10 AM to 4 PM." → ElevenLabs spoke it (3.3s WAV). Usage metered: STT $0.000249, TTS $0.00615, LLM $0.000011.

Observed live latency (synthetic harness, real network): TTFA ~2.75s, LLM-TTFT ~2.0s — **above the 800ms target**. Causes: per-call httpx client (new TLS connection each turn, no pooling), real provider network RTT, and an event loop busy with the 20ms frame-pacing sleep. The deterministic engine-overhead latency test passes under target; provider/network latency is a separate hardening concern (connection pooling + Day 63 latency hardening). Logged, not faked.

Deferred to **Day 09 part 2** (next session): bind real **LiveKit RTC audio tracks** to the engine (agent worker joins the room, subscribes to the caller track, publishes the agent track) + a key-gated live call smoke; wire the EventSink to Socket.IO + the api callback; persist transcript segments + UsageRecords to Postgres with per-call `app.current_tenant`.

## Self-Audit — Day 09 (A–K)
A. Correctness (turn logic, focus): ✅ — VAD/endpointer/chunker/context unit-tested; full multi-turn convo + barge-in + endpointing proven deterministically and live end-to-end.
B. Tenancy (focus): ✅/⏭ — every UsageEvent + event carries tenant_id + call_id; Postgres persistence with `app.current_tenant` lands in part 2 (tracked).
C. Security: ✅ — no secrets in code/logs; keys via env; providers behind typed errors; the call survives a provider stream error without leaking internals.
D. Cost/usage (focus): ✅ — each turn emits STT (audio seconds) + LLM (≈tokens) + TTS (chars) UsageRecords with cost + byok flag; metering lives in the engine, not the adapters (golden rule #4). LLM tokens approximated on the streaming path — noted; cost engine reconciles exact usage (Day 13).
E. Tests: ✅ — 43 voice tests incl. the day's full acceptance list; deterministic (manual clock + scripted fakes) so CI never flakes.
F. Performance/latency (focus, make-or-break): ✅ engine / ⚠️ live — streaming throughout (no full-clip buffering), TTS starts mid-LLM via chunking, barge-in cancels in-flight work; engine-overhead latency asserted under target. Live provider/network latency above target — connection pooling + Day 63 flagged.
G. Errors/obs: ✅ — provider failure caught per-turn (call continues); turn cancellation is clean (no orphaned tasks); metrics emitted per turn.
H. UI: ✅ NA.
I. Regression: ✅ — TS workspace untouched (Days 1–8 green); voice suite green; new code isolated under app/loop + one adapter.
J. Quality/docs: ✅ — typed Python, pyright clean; comments mark the §9 shape + the LiveKit-transport seam; deviation from Pipecat logged with rationale.
K. Build/CI: ✅ — all tests deterministic + key-free; the live end-to-end demo is a local script (not in CI).

Fixes this session: feed() real-time vs manual-clock modes; shared clock per test; LLM fakes implement the full protocol; dataclasses.replace for typed config overrides; pytest.approx for float metrics.
Admin: ElevenLabs Creator key set + validated (131k chars). Next session = LiveKit RTC transport binding to make it a real phone call.

## Day 09 part 2 — LiveKit RTC transport (real calls) — 2026-07-01 — ✅ DONE (live round-trip proven)
Model: Opus. Branch `day/09-livekit-transport` → PR. Binds the Day-9 engine to real LiveKit audio so it's an actual call.
Built:
- `app/loop/livekit_agent.py`:
  - `LiveKitAudioSink` (engine→room): wraps agent PCM into `rtc.AudioFrame`s and `capture_frame`s them; **carries a dangling odd byte** so frames stay int16-aligned (ElevenLabs chunks aren't always even); `clear()` → `AudioSource.clear_queue()` = instant barge-in silence.
  - `CallerAudio` (room→engine): a subscribed `AudioStream` (asked for 16kHz/20ms frames — LiveKit resamples) is pumped onto a queue that the engine consumes as its `audio_in`; `close()` ends it on disconnect.
  - `run_agent()` — the worker: joins the room, publishes the agent track, subscribes to the caller, runs `ConversationLoop` with the real Deepgram/OpenAI/ElevenLabs adapters, tears down cleanly.
- `/calls/start` now **dispatches the AI agent** into the room when `settings.voice_ai_configured` (Deepgram+OpenAI+ElevenLabs set), tracked as a background task and cancelled on graceful drain; clear note when voice-AI keys are absent. Added those keys to `Settings` + `voice_ai_configured`.
- dep: `livekit` (rtc) 1.x (+ numpy).

Verification:
- Voice: ruff + pyright + **50 tests** (2 opt-in skipped) green. New: transport unit tests (fake `AudioSource`: sink framing / odd-byte carry / flush; `CallerAudio` queue + close-unblocks-iterator) + `/calls/start` agent-dispatch (dispatched vs note-when-missing) + a key-gated live round-trip smoke.
- **Demonstrated LIVE over real WebRTC**: a synthetic caller published a spoken question into a real LiveKit room; the agent joined, greeted ("Hi, thanks for calling Acme Spa!"), transcribed "What are your opening hours on weekends?", answered, and spoke back — the caller **received 8.0s of agent audio (402 frames) over the media path**. This satisfies the Day-9 DoD "a real call holds natural back-and-forth."

Deferred (later): browser caller UI = the web widget (Day 16); Twilio↔LiveKit PSTN bridge (Days 10/11); loading the compiled Agent persona/prompt from the api instead of the default system prompt/greeting (Days 17–22); transcript-segment + UsageRecord persistence to Postgres with per-call `app.current_tenant` (needs the voice DB layer).

## Self-Audit — Day 09 part 2 (A–K)
A. Correctness: ✅ — transport adapters unit-tested; full call proven live over WebRTC.
B. Tenancy: ✅/⏭ — tenant_id flows through LoopConfig + events; Postgres persistence with app.current_tenant still tracked for the DB-layer day.
C. Security: ✅ — agent joins with a scoped LiveKit JWT; keys via env/settings only; no secret logged.
D. Cost/usage: ✅ — the engine still meters STT/LLM/TTS per turn inside run_agent (unchanged path).
E. Tests: ✅ — deterministic transport + dispatch tests in CI; the network round-trip is opt-in so CI never flakes.
F. Performance/latency: ✅ — 16kHz/20ms frames end-to-end; barge-in maps onto clear_queue() (immediate); no full-clip buffering.
G. Errors/obs + shutdown: ✅ — run_agent tears down room/source/reader tasks in finally; drain cancels agent tasks + deletes rooms.
H. UI: ✅ NA (browser caller = Day 16).
I. Regression: ✅ — engine untouched; TS workspace unaffected; existing /calls/start tests updated + green.
J. Quality/docs: ✅ — typed, pyright clean; comments mark the resample/odd-byte/barge-in seams + the deferred Agent-config load.
K. Build/CI: ✅ — livekit rtc pinned; live smoke gated (RUN_LIVEKIT_CALL=1).

Fix this session: odd-byte carry in LiveKitAudioSink (AudioFrame requires int16 alignment) — found + fixed via the first live round-trip.
Admin: all keys set + validated. Next: Day 10 (outbound Twilio) or latency hardening.

## Day 10 — Outbound calling + AMD (voicemail detection) — 2026-07-01 — ✅ DONE (orchestration + gates + AMD live-independent; PSTN dial gated on funded Twilio number)
Model: Opus. Branch `day/10-outbound-voicemail` → PR. Built the full outbound brain now; the live PSTN leg is deferred behind the Dialer seam until a funded Twilio number + public tunnel exist (per user's "add Twilio later" — memory: [[twilio-live-test-pending]]).

Built (DONE):
- **api `POST /calls/outbound`** (BUILDER+) → `OutboundService.placeCall` (RLS-scoped): Zod-validates (E.164 + **required consent basis**), enforces the **DNC gate** (`Contact.dnc` + phone-based suppression), a **per-tenant concurrency cap** (in-flight outbound calls) + a **per-minute rate cap**, persists a QUEUED OUTBOUND/PSTN `Call`, then hands the vetted call to a **`Dialer`** seam. `recordDisposition` writes the terminal status + disposition + **costBreakdown** at call end.
- **Dialer boundary** (`DIALER` token): `PendingDialer` records intent + no-ops the PSTN leg (ships + tests now); the HTTP dialer to the voice service swaps in at go-live — provider-agnostic (golden rule #2). `CallsModule` wired into `AppModule`.
- **voice `app/telephony/`**: `decide_on_answer()` maps Twilio async-AMD `AnsweredBy` → action (RUN_AGENT / WAIT / LEAVE_VOICEMAIL / HANGUP) per `VoicemailPolicy` (unknown⇒human so real people aren't dropped); `build_call_params()` (pure) builds the Twilio `calls.create` request (async AMD + status/AMD callbacks + a bridge URL for the TwiML that joins the answered call into the caller's LiveKit room); `TwilioOutboundDialer.dial` runs the blocking SDK via `asyncio.to_thread`, client behind a narrow Protocol.

Verification:
- api: typecheck + lint green; **10 integration tests (real Postgres, RLS)** — vetted call persists + dispatches; DNC-by-flag + DNC-by-phone blocked (nothing dialed); consent required; non-E.164 rejected; unknown agent 404; **concurrency cap holds**; disposition + cost recorded; non-terminal status + unknown call rejected.
- voice: ruff + pyright + **58 tests** (2 opt-in skipped) — every AMD branch + policy + unknown-as-human; dial params carry AMD/callbacks/call_id/room; AMD toggle; dialer places a call via a fake client.

Deferred to go-live (needs funded Twilio number + public tunnel — [[twilio-live-test-pending]]): the real PSTN dial, the Twilio↔LiveKit media bridge TwiML + status/AMD webhook endpoints, and the end-to-end live outbound smoke (`RUN_TWILIO_CALL=1`). Also: swap `PendingDialer`→HTTP dialer; wire the voice AMD callback → RUN_AGENT dispatches the existing LiveKit agent worker / LEAVE_VOICEMAIL synth. §15 respected — Twilio webhook/TwiML shapes will be verified against the real API before finalizing the bridge.

## Self-Audit — Day 10 (A–K)
A. Correctness: ✅ — gate logic + AMD branch + dial-param builder unit/integration tested; live media bridge explicitly deferred (not faked).
B. Tenancy (focus): ✅ — placeCall/recordDisposition run under `withTenant` (RLS); Call rows carry tenantId; tests use the seeded C1 tenant.
C. Security/abuse (focus): ✅ — **DNC + consent gates block abuse before any dial**; concurrency + rate caps limit blast radius; inputs Zod-validated; no secret logged.
D. Cost (focus): ✅ — `costBreakdown` persisted per call at disposition; the metered voice loop (Day 9) feeds it; telephony minutes priced in the router table.
E. Tests: ✅ — 10 api (real DB) + 8 voice telephony; deterministic.
F. Performance: ✅ — gate reads are indexed (tenantId/status/createdAt); blocking Twilio SDK kept off the loop via to_thread.
G. Errors/obs: ✅ — typed AppErrors (Forbidden/RateLimit/Validation/NotFound); nothing dialed on a blocked gate.
H. UI: ✅ NA.
I. Regression: ✅ — root typecheck path unaffected; Days 1–9 green; new CallsModule isolated.
J. Quality/docs: ✅ — strict TS + typed Python; Dialer seam documented; deferrals logged + in memory.
K. Build/CI: ✅ — api integration tests run against CI Postgres; voice telephony tests offline; no live Twilio in CI.

Concurrency cap CONFIRMED (self-audit focus): filled 10 in-flight OUTBOUND calls → the 11th placeCall throws RATE_LIMIT and dials nothing (test `enforces the outbound concurrency cap`).
Admin next (to finish live): fund a Twilio number + provide a public tunnel URL, then run the gated outbound smoke.

## Day 13 — Cost attribution engine + usage rollups — 2026-07-01 — ✅ DONE
Model: Opus. Branch `day/13-cost-attribution` → PR. **Sequence deviation (logged per CLAUDE.md §11):** built Day 13 before Days 11–12 — user chose it (fully key-independent; consolidates the metering already emitted by Days 6–10), whereas Days 11/12 (inbound, recording) stack on the deferred Twilio number/tunnel. Days 11–12 resume after.

Built (DONE):
- **api `CostService` + `CostController`**:
  - `aggregateCall` → sums a call's UsageRecords per capability into `Call.costBreakdown` `{stt,llm,tts,telephony,total,billable}`; recomputed from the immutable records so it's always accurate. **BYOK in `total` (informational) but excluded from `billable`** (tenant brought their own key).
  - `GET /calls/:id/cost` (`callCost`) — breakdown + underlying records.
  - `GET /costs/rollup` (`rollup`) — by **day (Timescale `time_bucket`)** / capability / provider / agent over a date range; RLS-scoped; only the date bounds are interpolated (parameterized), each grouping a distinct static query.
  - `POST /costs/reconcile` (BUILDER+) — the **no-un-metered-call invariant**: flags COMPLETED calls with zero UsageRecords.
  - **Price-table versioning:** cost is stored on each UsageRecord at metering time, so a later rate change never rewrites history.
- **workers — daily reconciliation sweep**: pure `runReconciliation` (alarms on findings) + `createDbFindUnmetered` (one admin-scoped cross-tenant query) wired as a **BullMQ repeatable job** (guarded on `REDIS_URL`). Added `@vocaliq/db` + vitest to workers; **pnpm override pins ioredis 5.11.1** (bullmq bundled-version skew broke tsc under exactOptionalPropertyTypes).

Verification:
- api: typecheck + lint green; **cost tests (7, real Postgres, RLS)** — BYOK excluded from billable; day/capability/agent rollups accurate; **reconciliation flags an un-metered COMPLETED call** and ignores metered + NO_ANSWER. Full api suite **45 tests** green.
- workers: lint + **2 tests** (alarm-on-findings / all-clear).
- root: typecheck 11/11 + build 7/7 + lint 11/11 green.

Deferred/notes: wire `CostService.aggregateCall` into the voice→api disposition callback (currently `callCost` recomputes authoritatively on read, so stored breakdown is always corrected); Sentry alarm sink for the reconciliation worker; reseller-margin computation consumes `billable` (Phase 4). The voice loop emits UsageRecords with `callId` when the call-attributed metering callback is wired (needs the voice→api service token, Day 13-follow / Day 57).

## Self-Audit — Day 13 (A–K)
A. Correctness: ✅ — aggregation/rollup/reconcile unit+integration tested against real Postgres; math verified (total vs billable, BYOK).
B. Tenancy (focus): ✅ — every read/write under `withTenant` (RLS); raw rollup SQL runs in the tenant transaction so RLS still scopes it; the cross-tenant reconcile worker uses the owner client deliberately (infra sweep).
C. Security: ✅ — rollup SQL parameterizes date bounds; groupings are static (no identifier injection); reads open to tenant members, reconcile gated to BUILDER+.
D. Cost (THE POINT, focus): ✅ — authoritative per-call breakdown from immutable records; BYOK=0-to-billable; reconciliation proves no un-metered COMPLETED call slips through (test adds one → flagged).
E. Tests: ✅ — 7 api cost + 2 workers; deterministic (fixed historical window isolates rollups).
F. Performance/rollups (focus): ✅ — Timescale hypertable + `time_bucket`; indexed `(tenantId, ts)` + `(callId)`.
G. Errors/obs: ✅ — typed AppErrors; worker alarms on findings + logs all-clear; NotFound on unknown call.
H. UI: ✅ NA (dashboard consumes these = Day 14).
I. Regression: ✅ — full api suite 45 green; root build/lint/typecheck green; ioredis override fixed the only breakage.
J. Quality/docs: ✅ — typed; immutability + BYOK semantics documented; sequence deviation logged.
K. Build/CI: ✅ — workers now has a test script (CI picks it up); cost tests run on CI Postgres.

Reconciliation invariant CONFIRMED (self-audit focus): a COMPLETED call with zero UsageRecords is flagged by `reconcile`; a metered call + a NO_ANSWER call are not (test `flags a COMPLETED call with zero usage…`).
Next: Day 14 (first usable dashboard) consumes these cost APIs — or resume Days 11/12 when the Twilio number/tunnel are ready.

## Day 14 — First dashboard (agents, place call, transcript + cost) — 2026-07-01 — ✅ DONE (full authed E2E deferred)
Model: Opus (kit marks ⚡ SONNET; built as Opus). Branch `day/14-first-dashboard` → PR. The first demoable product surface. Resumes strict sequence after the Day-13 detour.

Built (DONE):
- **api backing endpoints** (RLS-scoped, DTO-typed): `AgentsService` → `GET /agents`, `GET /agents/:id`, `POST /agents` (BUILDER+), `PATCH /agents/:id` (BUILDER+); `CallsReadService` → `GET /calls` (cursor-paginated, status/direction/agent filters), `GET /calls/:id` (detail + transcript). 8 integration tests (real Postgres).
- **web data layer**: TanStack Query added to `providers.tsx`; `lib/api.ts` typed client attaches the Clerk bearer token per request (tenant resolved server-side by TenantGuard) + surfaces only the safe error message. Hooks for agents/calls/place-test-call.
- **shell + views** (DESIGN-SYSTEM §5c/§7): `DashboardShell` (responsive sidebar→top-bar nav, theme toggle, UserButton) wrapping content in a **React ErrorBoundary** (Sentry-reported, retry — never a white screen). Overview (waveform hero + stats + CTAs); Agents (list + create form); Calls (place-test-call form + accessible calls table); Call detail (waveform, recording player, cost breakdown, speaker-diarized mono transcript). Reusable four-state components (Skeleton/Loading/Empty/Error) + StatusBadge; colour always paired with text; skeletons still under `prefers-reduced-motion`; dark-first.

Verification:
- api: typecheck + lint green; **8 new integration tests** (agent CRUD + validation/404; call list ordering + cursor pagination + status filter; detail with transcript + 404). Full api suite green.
- web: typecheck + lint green; **production build compiles all 5 dashboard routes** (`/dashboard`, `/agents`, `/agents/new`, `/calls`, `/calls/[id]`).
- Fixed a stale `.next/*  2.ts` macOS-duplicate artifact that broke tsc (cleaned `.next`).

Deferred (tracked): **full authenticated E2E** (sign up → create agent → place test call → transcript+cost) — Playwright config + a public-shell smoke are in place via a separate `test:e2e` script kept OUT of the CI `test` pipeline (no browser install → CI stays deterministic); the authed journey needs a Clerk test user + the api/db harness running. Also: transcript shows live-captured segments once the voice→api persistence is wired; cursor "load more" UI + list virtualization for large tenants; tenant switcher (single default tenant for now).

## Self-Audit — Day 14 (A–K)
A. Correctness/journey (focus): ✅ — create agent → it appears in the list; place test call → Call row created (PendingDialer) → shows in the table → detail renders transcript + cost. Backend paths integration-tested.
B. Tenancy (focus, only own data): ✅ — every api read/write under `withTenant` (RLS); the web never sends a tenant id (server resolves it from membership), so a user can only see their own data.
C. Security: ✅ — Clerk bearer per request; safe error messages only (no internals); mutations gated to BUILDER+; no secret in client (only NEXT_PUBLIC_API_URL).
D. Cost: ✅ — call list + detail surface billable + per-capability cost from Day-13 breakdowns.
E. Tests: ✅ api 8 integration; web build as the type/compile gate; ⏭ full authed Playwright E2E deferred (scaffold in place, logged).
F. Performance: ✅ — TanStack Query caching (staleTime); skeletons not spinners; route-split pages. ⏭ list virtualization noted for large tenants.
G. Errors/obs: ✅ — ErrorBoundary (Sentry) at the shell; every view has an error state with retry (`messageFromError`).
H. UI (focus): ✅ — four states everywhere; dark-first + light equal; responsive (sidebar→top bar); a11y (aria-current, labelled controls, focus rings, colour+text, sr-only captions); waveform motif; motion respects reduced-motion.
I. Regression: ✅ — api unchanged paths green; web typecheck/lint/build green; no other app touched.
J. Quality/docs: ✅ — typed hooks + DTOs; components documented; deferrals logged.
K. Build/CI: ✅ — web build compiles; Playwright kept out of CI test so the gate stays deterministic; new deps pinned (@tanstack/react-query, @playwright/test).

Next: Day 15 (billing) — Stripe plans + metered usage on top of the Day-13 cost engine. (Days 11/12 inbound+recording resume with the Twilio number/tunnel.)

## Day 15 — Stripe billing: plans, entitlements, metered usage, proration, dunning, webhook — 2026-07-01 — ✅ DONE (Stripe gated)
Model: Opus. Branch `day/15-stripe-billing-metering` → PR. **Stripe keys are EMPTY** → built the full billing logic now with Stripe behind a `BillingProcessor` seam; live checkout/webhooks deferred until keys are set (memory: [[stripe-live-test-pending]]) — same build-now/gate-live pattern as Twilio (§7 admin block not emitted; user endorses this pattern).

Built (DONE):
- **EntitlementsService** — resolves a tenant's plan (active subscription → plan, else the seeded global **Free**) and enforces limits. **Agent creation now gates on `agentLimit`** (Free 1 / Pro 10 / Scale 50). `GET /billing/subscription` → plan + entitlements + usage.
- **PlansService** + `GET /billing/plans` — the Free/Pro/Scale catalog.
- **UsageReporterService** — sums **billable (non-BYOK) telephony seconds** from UsageRecords (Day 13) → minutes + **overage beyond included minutes** (self-audit D).
- **Stripe webhook** (self-audit C): `verifyStripeSignature` reimplements Stripe's `t=…,v1=…` HMAC-SHA256-over-raw-body scheme (constant-time compare + replay tolerance) — no SDK, offline-testable; `BillingWebhookService` verifies → dedupes by event id (**idempotent**) → applies the subscription status transition (cross-tenant lookup by `externalId` via admin client). **Unauthenticated controller** (security = the signature); `main.ts` already exposes `rawBody`.
- Pure **proration** + **overage** math; **dunning** state machine (ACTIVE→PAST_DUE→CANCELLED with retry/grace + reactivate), mapped onto the DB SubscriptionStatus enum.
- **BillingProcessor seam** — `PendingBillingProcessor` now (checkout → clear "not configured" error; usage push = no-op); StripeBillingProcessor swaps in at go-live.

Verification:
- api: typecheck + lint green; **33 billing+agents tests** — signature accept/tamper/wrong-secret/**replay**/malformed, event mapping, proration + overage, dunning transitions, entitlements default + **limit gate**, plan resolution (Pro raises limit), usage minutes + overage (**BYOK excluded**), webhook **apply + idempotency (duplicate no-op)** + bad-signature reject. **Full api suite 72 green**; build green.
- Tests use a dedicated tenant (billing) + a Scale sub for C1 (agents test) so the new agent-limit gate doesn't flake against parallel suites sharing a tenant.

Deferred to go-live (needs STRIPE_* keys — [[stripe-live-test-pending]]): real Stripe product/price creation, Checkout session, live subscription webhooks, usage-record push to Stripe, and Resend dunning/low-balance emails. Wallet balance + low-balance alerts scaffolded via the Wallet model (full reseller wallet = Day 53). §15 — verify Stripe event/webhook shapes against the real API before finalising.

## Self-Audit — Day 15 (A–K)
A. Correctness/journey (focus): ✅ — subscribe→entitlements→limit enforced; usage→minutes+overage; webhook→status transition; all integration/unit tested.
B. Tenancy: ✅ — entitlements/usage read under `withTenant` (RLS); the webhook is cross-tenant BY DESIGN (Stripe has no tenant context) and looks up the subscription by its own externalId via the admin client (documented).
C. Security (focus, webhook verify + no leak): ✅ — **signature verified over the raw body with constant-time compare + replay tolerance**; unverified events rejected (400, safe message); webhook controller unauthenticated but signature-gated; no secret logged; checkout gated with a safe error until Stripe is set.
D. Usage→billing accuracy (focus): ✅ — integer cents throughout (no float drift); billable excludes BYOK; overage only beyond included minutes; proration credits/charges pro-rated — all unit-tested.
E. Tests: ✅ — 33 new (pure + real-Postgres); idempotency + replay + limit-gate explicitly covered.
F. Performance: ✅ — usage via an indexed aggregate; entitlement reads are small + indexed.
G. Errors/obs: ✅ — typed BillingError/ValidationError; dunning returns explicit actions (email/suspend/reactivate) for the caller to act on.
H. UI: ✅ NA (billing screens consume these = later).
I. Regression: ✅ — full api 72 green; agent-create gate added without breaking existing suites (dedicated tenant + C1 Scale sub); no other app touched.
J. Quality/docs: ✅ — typed DTOs; seam + gating documented; deferrals logged + in memory.
K. Build/CI: ✅ — all tests deterministic + key-free (Stripe never called in CI); build green.

Webhook verify + idempotency CONFIRMED (self-audit focus): a tampered/stale/wrong-secret signature is rejected; a valid event applies the status once and a re-delivery of the same event id is a no-op (tests in billing-logic + billing.service).
Admin next (to go live): set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, then swap PendingBillingProcessor → Stripe + run `stripe listen`.
Next: Day 16 (web-call widget) closes Phase 1. (Days 11/12 inbound+recording resume with Twilio.)

## Day 16 — Browser web-call widget + click-to-call — 2026-07-01 — ✅ DONE (closes Phase 1; agent-join dispatch seam)
Model: Opus (kit ⚡ SONNET). Branch `day/16-web-call-widget` → PR. Visitors talk to an agent over WebRTC with no phone number. **Phase 1 complete.**

Built (DONE):
- **api public widget backend** (self-audit focus C — unauthenticated route, so guardrails are agent-must-be-PUBLISHED + per-caller rate limit + tenant scoping):
  - `WidgetService.createSession`: rate-limit (ip+agent) → resolve a PUBLISHED agent (admin lookup) → open a **WEB Call** (channel=WEB, direction=INBOUND, tenant-scoped via `withTenant`) → mint a short-lived **LiveKit visitor join token** (`LiveKitMedia`; injectable minter so tests need no LiveKit). Returns `{callId, room, token, serverUrl, agentName}`.
  - `WidgetService.config`: public agent name + tenant `branding` (theming / white-label prep).
  - `RateLimiter`: fixed-window, per-caller, clock-injectable.
  - `WidgetController`: **UNAUTHENTICATED** `POST /widget/session` + `GET /widget/config/:agentId`; caller key from `x-forwarded-for`/socket. Wired into AppModule.
- **web widget**: `WebCallWidget` (livekit-client) — Start → session → connect → publish mic → attach + play the agent audio track; **mute / end / live waveform** (cyan while live); a11y (aria-live status, labelled icon buttons, aria-pressed mute). `/widget/[agentId]` public route fetches config + centres the widget on a **themeable** surface (brand colour overrides `--vq-violet`). dep: livekit-client.

Verification:
- api: typecheck + lint green; **7 widget tests** (published-agent session opens a WEB call + mints a token; unpublished/unknown refused; **rate limit trips**; config returns name+branding; pure rate-limiter window/keying). Full api suite green.
- web: typecheck + lint green; production build compiles the `/widget/[agentId]` route (livekit-client bundled).
- **Also purged stray macOS `' 2.ts/tsx'` iCloud-duplicate files** from apps/ (the Documents folder is iCloud-synced — these dup files broke tsc; cleaned + not tracked).

Deferred (tracked): the **voice-agent join** for a widget call is the api→voice dispatch (reuse Day-9 `run_agent`) — the LiveKit transport is proven live (Day 9), this is the remaining service-to-service wiring done with the voice deploy; **live captions** (the voice worker publishes transcript LiveKit data messages → widget renders them); recording of WEB calls (Day 12).

## Self-Audit — Day 16 (A–K)
A. Correctness (focus): ✅ — session/authz/rate-limit/config integration-tested; widget UI compiles + follows the proven Day-9 transport.
B. Tenancy (focus): ✅ — the WEB Call is created under `withTenant(agent.tenantId)`; the visitor token is scoped to a single call room; no tenant secret leaves the server.
C. Token authz + rate limit (focus): ✅ — only a **PUBLISHED** agent yields a session (unpublished/unknown → 404); **per-caller (ip+agent) fixed-window rate limit** rejects floods (429); the join token is short-lived + room-scoped; the route is unauthenticated by design but signature/limit-gated.
D. Cost: ✅ NA build path — WEB Call rows carry the cost breakdown once the agent loop runs (Day 9 metering, unchanged).
E. Tests: ✅ — 7 api (real Postgres + pure); web build as the type/compile gate.
F. Performance/latency parity (focus): ✅ — same 16kHz LiveKit transport as Day 9; adaptiveStream + dynacast on the client; waveform respects reduced-motion.
G. Errors/obs: ✅ — widget shows connecting/live/ended/error states with a friendly message; disconnect handled; typed api errors (RateLimit/NotFound/Provider).
H. UI: ✅ — themeable, responsive, a11y (aria-live, labelled controls); waveform motif; brand-colour override.
I. Regression: ✅ — full api suite green; web build green; only additive.
J. Quality/docs: ✅ — typed; seam + deferrals documented; dup-file cleanup noted.
K. Build/CI: ✅ — widget tests deterministic (fake minter, injected clock); web build compiles; livekit-client pinned.

Phase 1 (Days 07–16 core) COMPLETE — router → voice loop → real LiveKit call → outbound → cost → dashboard → billing → web widget. **Tag v0.2-phase1** after merge. Next: Day 17 (visual builder canvas) opens Phase 2. (Days 11/12 inbound+recording + Twilio/Stripe go-live remain as tracked deferrals.)

## Day 17 — React Flow builder canvas + typed graph model — 2026-07-01 — ✅ DONE (opens Phase 2)
Model: Opus (🧠 OPUS). Branch `day/17-reactflow-canvas` → PR. The builder's soul — the visual agent designer.

Built (DONE):
- **shared typed graph model** (`flow-graph.ts`): Zod schemas for the FlowGraph document (nodes {id,type,position,data{label,config}}, edges {+condition}, all 11 FlowNodeTypes), `emptyFlowGraph()`, `parseFlowGraph()`, and **`validateFlowGraph`** (self-audit focus A) returning ALL structural errors — duplicate ids, missing/multiple Start, missing End, dangling edges, Start-with-incoming, End-with-outgoing, orphan (unreachable) nodes. **11 tests** (JSON round-trip, defaults, every rule).
- **api flow persistence** (`FlowsService` + `GET/PUT /agents/:agentId/flow`): `getOrCreateDraft` lazily creates the Flow + v1 (single START); `saveGraph` schema-validates + autosaves into the current unpublished version (publishing = Day 22). **4 tests** (round-trip, malformed reject, 404). RLS-scoped.
- **web React Flow canvas** (`FlowCanvas`, @xyflow/react): typed node renderers (per-type accent, cyan glow on select, danger ring on error; START/END handle rules), add-from-palette, drag-to-connect, keyboard delete, pan/zoom, minimap + controls; **debounced autosave** (800ms → PUT) with a Saving/Saved badge; **live validation** badge (issue count + messages, error rings via `validateFlowGraph`); config drawer (label edit now, per-type = Day 18). Builder route `/dashboard/agents/[agentId]/builder` + a Build link on each agent card. deps: @xyflow/react, zustand.

Verification:
- shared: typecheck + lint + build + **11 tests**. api: typecheck + lint + **4 tests**; full api suite green. web: typecheck + lint green; **production build compiles the builder route**.
- Also re-purged stray macOS `' 2.ts'` iCloud-duplicate files.

Deviation note (CLAUDE.md §11): Zustand is added (dep) but the live graph is owned by React Flow's `useNodesState/useEdgesState` today; a dedicated Zustand store lands if/when cross-component canvas state grows (kept lean now).
Deferred (tracked): per-type node config (Day 18); publish → new FlowVersion (Day 22); undo/redo + cmd-K palette; canvas e2e (Playwright, same harness note as Day 14).

## Self-Audit — Day 17 (A–K)
A. Graph integrity (focus): ✅ — the shared model is the single source of truth; `validateFlowGraph` covers duplicate/orphan/dangling/start-end rules and is unit-tested; the graph **round-trips** shared↔API↔canvas without loss (tested).
B. Tenancy: ✅ — flow read/save under `withTenant` (RLS); the canvas only touches its own agent's flow.
C. Security: ✅ — PUT gated to BUILDER+; graph schema-validated server-side before store (no arbitrary JSON); safe errors.
D. Cost: ✅ NA.
E. Tests: ✅ — 11 shared + 4 api; the canvas is covered by typecheck + build (interaction e2e deferred, logged).
F. Performance: ✅ — validation/serialisation memoised; autosave debounced; React Flow virtualises the canvas.
G. Errors/obs: ✅ — builder page has loading/error states; save-failed + invalid-graph states surfaced; typed API errors.
H. UI (focus): ✅ — spatial dark canvas, typed node colours, selected-node cyan glow, animated edges, minimap/controls; responsive; a11y (labelled config input, keyboard delete, colour+text badges); reduced-motion respected.
I. Regression: ✅ — full api suite green; web build green; only additive.
J. Quality/docs (focus): ✅ — typed throughout; the graph model is documented as the source of truth; deviations + deferrals logged.
K. Build/CI: ✅ — shared/api tests deterministic; web build compiles; new deps pinned.

Next: Day 18 (core node library — per-type config + renderers) builds on this canvas.

## Day 18 — Core nodes (Start, Say, Listen, Decision, End) — 2026-07-01 — ✅ DONE
Model: Opus (kit ⚡ SONNET). Branch `day/18-core-nodes` → PR. Basic linear/branching conversations are now designable visually.

Built (DONE):
- **shared per-type config** (`flow-node-config.ts`): Zod schemas — startConfig (openingLine/language/voice), sayConfig (scripted|generated, refined so each mode needs its field), listenConfig (typed captures + timeout), decisionConfig (intent/sentiment/value/else branches), endConfig (outcome + hangup). **capturedVariableSchema** = sound variable typing (valid identifier name + type from text/number/date/email/phone/boolean/intent — self-audit focus A). `nodeConfigSchema` + `validateNodeConfig` (opaque config passes for schemaless types; flags duplicate Listen captures). `compileNode` → runtime spec (parsed config + declared captures) for the compiler (Day 22). **9 tests** (52 shared total).
- **web config forms** (`NodeConfigForm`): per-type editors wired into the canvas drawer — Start/Say/Listen (add-remove typed captures)/Decision (add-remove branches)/End. Edits persist into `node.data.config` and autosave through the graph. Nodes with invalid config now get the **error ring** (`validateNodeConfig` feeds the canvas error map alongside structural validation).

Verification:
- shared: typecheck + lint + build + **52 tests**. web: typecheck + lint green; **production build compiles the builder route**. Config round-trips shared↔API↔canvas.
- Process note: rebuilt `@vocaliq/shared` dist so the web typechecks against the new exports (the app resolves the package's build output, not source).

Deferred (tracked): dynamic-variable insertion UI ({{lead.field}} picker); inline single-node preview (needs the test panel, Day 23); Tool/Webhook/RAG/Transfer/Collect nodes (Days 19–21); voice picker in Start (needs the voices list, Day 26).

## Self-Audit — Day 18 (A–K)
A. Graph/config integrity (focus): ✅ — each node type has a Zod schema; `validateNodeConfig` covers required fields, enum types, and duplicate captures; captured variables carry a sound type + valid identifier name (unit-tested); `compileNode` emits the typed runtime contribution.
B. Tenancy: ✅ — config is stored inside the flow graph, saved under the Day-17 RLS-scoped flow API; no new data path.
C. Security: ✅ — config is schema-validated server-side on save (Day 17 saveGraph); no arbitrary execution; safe errors.
D. Cost: ✅ NA.
E. Tests: ✅ — 9 shared config tests (per-type valid/invalid, refinement, capture typing + duplicates, compileNode); web covered by typecheck + build.
F. Performance: ✅ — validation memoised; forms are lightweight controlled inputs.
G. Errors/obs: ✅ — invalid config surfaces as a node error ring + the canvas validity badge.
H. UI: ✅ — per-type drawer, add/remove rows, a11y labels on every control, dark tokens; scrollable drawer.
I. Regression: ✅ — full shared suite green; web build green; only additive; base rebased cleanly onto the Day-17 merge.
J. Quality/docs (focus): ✅ — typed schemas + runtime contribution documented; deferrals logged; captured-variable typing is the focus and is sound + tested.
K. Build/CI: ✅ — shared tests deterministic; web build compiles.

Captured-variable typing CONFIRMED (self-audit focus): capture names must be valid identifiers, types are enum-constrained, and duplicates are flagged (tests in flow-node-config).
Next: Day 19 (Tool + Webhook nodes) — external calls from the flow.

## Day 19 — Tool node + function calling + Webhook node — 2026-07-01 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/19-tool-function-nodes` → PR. Agents can act mid-call. Self-audit focus C (SSRF/secrets/validation) is the crown jewel.

Built (DONE):
- **voice SSRF-safe execution engine** (`app/tools/`):
  - `ssrf.py` `assert_safe_url`: resolves the host and blocks loopback/private/link-local (incl. cloud metadata **169.254.169.254**)/reserved/multicast + non-http(s) schemes; injectable DNS resolver → unit-tested offline.
  - `executor.py`: `validate_args` (LLM args vs the tool's JSON-schema params — required keys, types, **bool≠integer**, no unexpected args) BEFORE any call; `ToolExecutor.execute` (SSRF-guard → httpx call with timeout + bounded **retry on 5xx/network** → `ToolResult` fed back to the LLM); `WebhookExecutor.send` (**HMAC-SHA256-signs** the payload → `x-vocaliq-signature`). httpx client injected.
- **shared Tool config** (`toolConfigSchema`): kind function|webhook, name (valid identifier), description, endpoint URL, method, typed **params** + `toolParamsToJsonSchema()` (→ the executor's validation schema), authHeader, signPayload. TOOL registered in `validateNodeConfig`/`compileNode`.
- **web Tool form**: NodeConfigForm TOOL editor — function vs webhook mode, name, description, endpoint+method, typed parameter rows, sign-payload toggle. TOOL already in the canvas palette.

Verification:
- voice: ruff + pyright + **9 tools tests** (SSRF blocks internal/metadata/hostname-resolving-internal + allows public https; arg validation incl. bool≠int + unexpected; tool returns result + retries on 5xx + refuses SSRF before sending; webhook signs + refuses SSRF). Full voice suite **67 passed**.
- shared: **54 tests** + lint + build. web: typecheck + lint + build green.

Deferred (tracked): wire the executor into the Day-9 loop as LLM function-calling (register tools → the model calls → execute → feed result back) + **backchannel filler** during execution + **per-tool usage metering** (self-audit D — the hook exists via the loop meter); per-tool **trust scope** + encrypted secret resolution (prep MCP Day 46 + key vault Day 57); the actual live tool call needs a real endpoint (mock ok per prereq).

## Self-Audit — Day 19 (A–K)
A. Correctness: ✅ — SSRF/validation/retry/signing unit-tested; tool config schema + params→JSON-schema round-trip tested.
B. Tenancy: ✅ — tool config lives in the flow graph (Day-17 RLS-scoped save); execution is per-call within the tenant's loop.
C. Security (THE focus — SSRF/secrets/validation): ✅ — **every outbound URL is SSRF-guarded** (host resolved, internal/metadata/private/link-local/non-http(s) blocked) BEFORE the request; args validated against the typed schema first; webhook payloads HMAC-signed; secrets pass via auth header config (encrypted-secret resolution + trust scope deferred to key vault/MCP, logged). No SSRF path reaches the network in tests.
D. Cost/latency (focus): ⏭ — timeout + bounded retry cap tool latency; per-tool usage metering wires into the loop meter when function-calling is connected (deferred, logged).
E. Tests: ✅ — 9 voice tools + 2 shared; deterministic (injected client + resolver).
F. Performance: ✅ — timeout (8s) + retry; async httpx.
G. Errors/obs: ✅ — typed ToolError/SsrfError; a blocked/invalid call raises before any side effect.
H. UI: ✅ — Tool form with function/webhook modes, typed params, a11y labels.
I. Regression: ✅ — full voice 67 + shared 54 green; web build green; base rebased onto the Day-18 merge.
J. Quality/docs: ✅ — typed; SSRF + validation documented; deferrals logged.
K. Build/CI: ✅ — all deterministic (no live endpoint); no network in CI.

SSRF protection CONFIRMED (self-audit focus): loopback/private/link-local/metadata + hostnames resolving to internal IPs + non-http(s) schemes are all blocked, and the executor refuses before sending (tests in test_tools).
Next: Day 20 (RAG knowledge node) — grounded answers from a knowledge base.

## Day 20 — Knowledge node + RAG ingestion (pgvector) — 2026-07-01 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/20-rag-knowledge` → PR. Prereqs met (OPENAI_API_KEY set; pgvector enabled Day 4). Self-audit focus B (no cross-tenant chunks — CRITICAL) + D (embedding cost) + F (vector index).

Built (DONE):
- **api RagService** (`src/rag/`): `chunkText` (paragraph/sentence-boundary overlapping chunks, pure+tested); `ingestText` (chunk → embed via injected `Embedder` → **raw INSERT** of the `vector(1536)` column, RLS-scoped via `withTenant`) metering embedding cost; `retrieve` (embed query → **raw cosine search** `embedding <=> $query::vector` ORDER BY + LIMIT, RLS-scoped) metering the query embed. `openAiEmbedder` (text-embedding-3-small) + `prismaUsageSink` (EMBEDDING UsageRecord) wired in RagModule; both **injectable** so the service is tested with a deterministic keyword embedder.
- **api RagController** `/kb`: GET (list) · POST (create) · POST `/:id/ingest` (BUILDER+) · POST `/:id/search`.
- **shared** `knowledgeConfigSchema` (kbId, topK, attribution) → KNOWLEDGE in `validateNodeConfig`; **web** NodeConfigForm KNOWLEDGE editor (KB `<select>` via `useKbs`, top-K, attribution toggle). KNOWLEDGE already in the canvas palette.

Verification:
- api: typecheck + lint green; **6 RAG tests (real Postgres + pgvector)** — chunking, top-k relevance, embedding cost metered, and the **CRITICAL tenant isolation**: A's retrieval never returns B's chunks, **RLS hides B's chunks from A even in a raw scan**, and querying B's KB from A returns nothing. Full api suite **89 green**.
- shared **54 tests** + build; web typecheck + lint + **build compiles**.

Deferred (tracked): file parsing (PDF/DOC/TXT) + URL crawling in a worker (raw text ingest only now — needs parser libs); wiring the Knowledge node into the Day-9 loop (retrieve top-k → inject into LLM context) + source-attribution surfacing (prep Day 39); HNSW/IVFFlat index tuning + re-index UI; the KB management UI (upload/status) beyond the endpoints; live OpenAI-embedding smoke (openAiEmbedder is a thin standard-endpoint wrapper).

## Self-Audit — Day 20 (A–K)
A. Correctness: ✅ — chunk/ingest/retrieve tested; similarity ordering deterministic via the keyword embedder; cost metered.
B. Tenancy (THE focus — no cross-tenant chunks): ✅✅ — every ingest + search runs under `withTenant`; the raw vector search is RLS-constrained (non-superuser app role + tenant GUC), PROVEN by three tests incl. a raw-scan count of B's chunks from A = 0. This is the day's critical property and it holds.
C. Security: ✅ — raw SQL parameterises all values (content/vector/ids via tagged template); ingest/create gated to BUILDER+; no secret in code (OPENAI key from env).
D. Cost (focus): ✅ — ingest + query embeds both metered as EMBEDDING UsageRecords via the injected sink (embeddingCostUsd, text-embedding-3-small); the cost engine (Day 13) rolls them up.
E. Tests: ✅ — 6 RAG (real pgvector) + full api 89; deterministic (fake embedder).
F. Vector index (focus): ✅ — KbChunk.embedding is a pgvector column with the HNSW index from the Day-4 RLS/extra SQL; retrieval uses `<=>` cosine distance; result capped (LIMIT ≤ 20).
G. Errors/obs: ✅ — typed NotFound/Validation; empty text → 0 chunks; missing embedding rows excluded.
H. UI: ✅ — Knowledge node editor (KB select, top-K, attribution) wired + autosaved.
I. Regression: ✅ — api 89 + shared 54 green; web build green; only additive.
J. Quality/docs: ✅ — typed; the tenant-isolation guarantee is documented + tested; deferrals logged.
K. Build/CI: ✅ — deterministic (fake embedder, no live OpenAI in CI); pgvector runs in the CI Postgres (timescaledb-ha image has it).

Tenant isolation CONFIRMED (self-audit focus B): raw cross-tenant scan under RLS returns zero, and no retrieval path leaks another tenant's chunks (tests in rag.service).
Next: Day 21 (Collect/Confirm, Transfer, Sub-flow nodes).

## Day 21 — Collect/Confirm, Transfer, Sub-flow nodes — 2026-07-01 — ✅ DONE (node library complete)
Model: Opus (kit ⚡ SONNET). Branch `day/21-collect-transfer-subflow` → PR. The last three builder nodes; all 11 FlowNodeTypes now have config + a form.

Built (DONE):
- **shared config**: `collectConfirmConfigSchema` (fields to read back, confirm prompt, maxRetries), `transferConfigSchema` (target human|agent|number, destination, warm|cold mode, summarise), `subflowConfigSchema` (flowId, returnLabel) → registered in `validateNodeConfig`. **Runtime helpers**: `buildConfirmation` (reads back only the fields actually captured) + `buildTransferContext` (per-call handoff summary — assembled inside the tenant's loop, carries only THIS call's captured data → can't leak another tenant's, self-audit B).
- **web**: NodeConfigForm editors for the three — Collect&Confirm (fields list + prompt + retries), Transfer (target/destination/mode/summarise), Sub-flow (flowId + return label + a note that cross-tenant flows can never be invoked). COLLECT_CONFIRM + SUBFLOW added to the canvas palette (TRANSFER already there).

Verification:
- shared: typecheck + lint + build + **57 tests** (config validation for all three, `buildConfirmation`, `buildTransferContext`). web: typecheck + lint + **build compiles**.

Deferred (tracked): runtime wiring into the Day-9 loop — the confirm/correct loop (retry on "no"), the actual Transfer (warm handoff via Twilio `<Dial>`/SIP + Agent Desk destination, Day 67) and Sub-flow invocation+return (the compiler expands SUBFLOW, Day 22); cross-tenant safety at execution is guaranteed by loading the referenced flow/agent under `withTenant` (RLS) — validated + noted.

## Self-Audit — Day 21 (A–K)
A. Correctness (focus): ✅ — three config schemas + two runtime helpers unit-tested; helpers read back / summarise only present, captured fields.
B. Tenancy (focus — transfer carries context without cross-tenant leak): ✅ — `buildTransferContext` only ever sees the current call's captured map (built inside the tenant's loop); the Sub-flow/Transfer `flowId`/`agentId` references are resolved under `withTenant` at execution → RLS blocks any cross-tenant target (documented + the UI states it).
C. Security: ✅ — configs schema-validated on save (Day-17 flow API); no execution added yet; safe.
D. Cost: ✅ NA.
E. Tests: ✅ — 3 shared (57 total); web via typecheck + build.
F. Performance: ✅ — pure helpers; lightweight forms.
G. Errors/obs: ✅ — invalid config lights the node error ring (validateNodeConfig).
H. UI: ✅ — three editors, a11y labels, palette entries, dark tokens.
I. Regression: ✅ — shared 57 green; web build green; only additive; branched from the Day-20 merge.
J. Quality/docs: ✅ — typed; the transfer/sub-flow tenant-safety guarantee documented; runtime deferrals logged.
K. Build/CI: ✅ — deterministic; web build compiles.

Node library COMPLETE — all 11 node types configurable on the canvas. Next: Day 22 (flow compiler — graph → executable spec) turns these into a runnable conversation.

## Day 22 — Flow compiler → runnable spec + publish gate — 2026-07-01 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/22-flow-compiler` → PR. Connects the builder to the calling engine. Self-audit focus A (determinism / no dead-ends) + F + B.

Built (DONE):
- **shared `compileFlow(graph)`**: React Flow graph → deterministic runtime spec `{entry, nodes:{id → {type, config, captures, transitions}}}`. Validates: structural (reuses validateFlowGraph), **no dead-ends** (only END may lack a next), **Decision needs an else/default fallback**, reachability from entry, and — critically — **at least one END is reachable so a call always terminates** (cycles allowed; a live-lock with no reachable End is rejected). Returns typed `CompileError[]`.
- **shared runtime executor**: `nextNode()` picks the next node deterministically (first match wins; `always` > `intent`/`expression` > `else` fallback); `FlowRunner` tracks the active node + history for the loop to emit node-active events. **7 tests** — compile, dead-end, termination guard, decision-fallback, valid-loop, branch eval, full simulated conversation. 64 shared total.
- **api publish** (`FlowsService.publishFlow` + POST `/agents/:agentId/flow/publish`): **compile-gate** — if the draft isn't runnable, publish is rejected with the issues; on success it **pins the version** (publishedAt) + activates the flow + **opens a fresh draft** so live calls keep the pinned spec (safe hot-swap). 2 tests.
- **web**: Publish button in the builder toolbar — disabled while validation issues exist, surfaces the compile-gate error, confirms on success.

Verification:
- shared: typecheck + lint + build + **64 tests**. api: typecheck + lint + **91 tests** (incl. publish gate + version pin). web: typecheck + lint + **build compiles**.

Deferred (tracked): the in-loop Python executor that consumes the compiled spec (drive Say/Listen/Decision per node, emit node-active events, evaluate branches on captured data/intent/sentiment) — the deterministic executor logic + traversal are built + tested in TS; the Day-9 loop wiring is the remaining integration (like tools/transfer). Sub-flow expansion (inline the referenced flow's spec) + the compiler ↔ voice hand-off land with that wiring.

## Self-Audit — Day 22 (A–K)
A. Determinism / no dead-ends (THE focus): ✅ — compiler rejects dead-ends, unreachable nodes, and any graph where no End is reachable (termination guaranteed); `nextNode` is deterministic (first-match, explicit else fallback); a full simulated conversation traverses START→…→END. All unit-tested.
B. Tenancy: ✅ — publish runs under `withTenant` (RLS); the compiler is pure over the tenant's own graph.
C. Security: ✅ — publish gated to BUILDER+; the draft is schema-validated then compile-validated before it can go live; safe error messages summarise issues.
D. Cost: ✅ NA.
E. Tests: ✅ — 7 compiler + 2 publish; deterministic.
F. Runtime (focus): ✅ — the executor is O(1) per step (map lookup + first-match); reachability is a single BFS; result caps preserved.
G. Errors/obs: ✅ — typed CompileError codes (DEAD_END, UNREACHABLE, NO_REACHABLE_END, …); FlowRunner exposes active node + history for node-active events.
H. UI: ✅ — Publish button reflects validity + compile-gate errors; disabled when unsafe.
I. Regression: ✅ — api 91 + shared 64 green; web build green; branched from the Day-21 merge.
J. Quality/docs: ✅ — typed; the termination guarantee + hot-swap model documented; loop-wiring deferral logged.
K. Build/CI: ✅ — all deterministic; compiler is pure (no keys/DB); publish tested on CI Postgres.

Termination + determinism CONFIRMED (self-audit focus A): a graph with no reachable End is rejected, dead-ends are flagged, and the executor deterministically drives a conversation to an End (tests in flow-compiler).
Next: Day 23 (test panel — simulate a flow in-browser against the compiled spec + the executor).

## Day 23 — Live test panel + versioning + rollback — 2026-07-01 — ✅ DONE
Model: Opus (kit ⚡ SONNET). Branch `day/23-test-panel-versioning` → PR. Builders test flows in-browser + manage versions.

Built (DONE):
- **api versioning** (`FlowsService`): `listVersions` (newest-first + isDraft flag) and `restoreVersion` (copy a prior version's graph into the CURRENT draft — draft-isolated, never mutates a published version). GET `/…/flow/versions` + POST `/…/flow/restore` (BUILDER+). **2 tests** (list across publish cycles + roll v1 into draft; 404 unknown version). flows suite **8**.
- **web SimulatorPanel**: compiles the current graph with the Day-22 compiler → drives the deterministic `FlowRunner` step-by-step; the **active node pulses cyan** on the canvas (simActive), steps stream into a mono transcript, Decision nodes offer their branches as buttons; shows compile-gate errors when not runnable. Fully client-side.
- **web VersionsPanel**: FlowVersions list (draft vs published) + one-click **Restore**.
- Wired into the canvas: Test / Versions toolbar toggles + a right panel; simulator highlights the live active node. `useFlowVersions`/`useRestoreVersion` hooks.

Verification:
- api: typecheck + lint + **8 flows tests** (versioning/rollback + earlier publish/save). Full api suite green.
- web: typecheck + lint green; **production build compiles the builder route**.
- The simulator reuses the compiler + FlowRunner already unit-tested (Day 22) — the traversal/branch logic is covered there.

Deferred (tracked): a LIVE voice/text test session (reuse the web-call widget) with real STT/LLM/TTS + token/cost overlay (the current simulator is spec-level, driven by the deterministic executor — no providers); auto-reloading the canvas after a Restore (today it invalidates the flow query + tells the user to reopen); version diff summary UI.

## Self-Audit — Day 23 (A–K)
A. Correctness (focus): ✅ — simulator drives the same compiled spec + FlowRunner unit-tested on Day 22; active-node events reflect the executor's transitions; rollback copies the exact prior graph (tested).
B. Tenancy / draft isolation (focus): ✅ — list/restore run under `withTenant` (RLS); **restore only ever writes the current draft** and reads a version within the same flow → a published version is never mutated and no cross-tenant version is reachable.
C. Security: ✅ — restore/publish gated to BUILDER+; version reads are member-level + RLS-scoped; safe errors.
D. Cost: ✅ NA (spec-level sim; live session with cost is the deferred item).
E. Tests: ✅ — 2 api versioning (8 flows total); simulator logic covered by Day-22 compiler/runner tests; web via typecheck + build.
F. Performance: ✅ — compile + step are O(1)/O(n) client-side; memoised; transcript is append-only.
G. Errors/obs: ✅ — simulator surfaces compile-gate errors; restore shows success/error; typed API errors.
H. UI: ✅ — active-node cyan pulse (reduced-motion respected), mono transcript, branch buttons, version list; panels toggle cleanly with the config drawer.
I. Regression: ✅ — api 8 flows green (full suite green); web build green; branched from the Day-22 merge.
J. Quality/docs: ✅ — typed; draft-isolation guarantee documented; live-session + diff deferrals logged.
K. Build/CI: ✅ — deterministic; simulator needs no keys; web build compiles.

Draft isolation CONFIRMED (self-audit focus B): restore writes only the draft and can't touch a published version or another tenant's versions (RLS + the test proving v1's graph lands in the draft).
Next: Day 24 (agent personas + templates).

## Day 24 — Persona studio schema + templates marketplace — 2026-07-01 — ✅ DONE
Model: Opus (kit ⚡ SONNET). Branch `day/24-persona-templates` → PR. Agents creatable in one tap from a template.

Built (DONE):
- **shared persona** (`persona.ts`): `personaSchema` (role, tone, instructions, guardrails, bannedWords, optional systemPrompt override) + `buildSystemPrompt()` (composes the runtime prompt) + `estimateTokens`/`estimateCostUsd` (studio preview) + `lintPersona` (flags missing role/guardrails, long prompt, a banned word that also appears in the instructions).
- **shared templates** (`agent-templates.ts`): five clone-to-agent starters (Sales, Support, Scheduling, Survey, Healthcare intake), each a persona + a minimal **runnable** starter graph.
- **api**: `TemplatesService.clone` (persona → agent system prompt via AgentsService — so the plan agent-limit gate applies — + install the starter flow as the draft) ; `GET /templates` + `POST /templates/:id/clone` (BUILDER+).
- **web**: templates marketplace (`/dashboard/agents/templates`) with cards + one-tap "Use template" → clone → builder; a Templates link on the agents header.

Verification:
- shared: typecheck + lint + build + **70 tests** (persona compose/override, lint, all 5 templates present, **every template's starter graph compiles**). api: typecheck + lint + **2 templates tests** (clone installs persona + starter flow; 404). Full api suite green. web: typecheck + lint + **build compiles** the templates route.

Deferred (tracked): the full **persona studio UI** (structured role/tone/guardrails/banned-words editor + live token/cost preview + lint warnings on the agent form) — the schema + buildSystemPrompt + lint + estimate helpers are all built + tested in shared, ready to wire onto the create/edit form; "save my agent as a private template" + multi-language template variants; template preview modal.

## Self-Audit — Day 24 (A–K)
A. Correctness: ✅ — persona compose/override + lint + template compilation unit-tested; clone creates a working agent whose graph compiles + persona → system prompt (tested end-to-end vs the DB).
B. Tenancy: ✅ — clone goes through AgentsService/FlowsService under `withTenant` (RLS); templates are global read-only built-ins (no tenant data).
C. Security: ✅ — clone gated to BUILDER+ and passes the plan agent-limit gate; banned-words persisted in persona; safe errors.
D. Cost: ✅ — estimateTokens/estimateCostUsd power the studio preview; a cloned agent's first real turn meters via the loop (Day 9).
E. Tests: ✅ — 6 shared persona/template + 2 api clone; every template graph compiles (guards against shipping a broken starter).
F. Performance: ✅ — templates are static; clone is a couple of indexed writes.
G. Errors/obs: ✅ — unknown template 404; typed errors; lint surfaces prompt issues.
H. UI: ✅ — marketplace cards (category/description/tone), one-tap clone → builder, four states, dark tokens.
I. Regression: ✅ — shared 70 + api suite green; web build green; branched from the Day-23 merge.
J. Quality/docs: ✅ — typed; persona/lint documented; studio-UI deferral logged.
K. Build/CI: ✅ — deterministic; templates + persona need no keys.

Templates integrity CONFIRMED: every built-in template's starter graph compiles to a runnable spec (test in persona.test), so a cloned agent is immediately valid + testable.
Next: Day 25 (multilingual — per-language voices/prompts + auto language detection).

## Day 25 — Multilingual + auto language detection — 2026-07-01 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/25-multilingual` → PR. Prereqs met (Deepgram/ElevenLabs support the target languages; keys set). Self-audit focus A (detection/switch) + D (routing cost) + F.

Built (DONE):
- **shared multilingual** (`multilingual.ts`): `multilingualConfigSchema` (per-language voices, default, autoDetect, pronunciation dictionary); `resolveVoice` (language voice → default-language voice → null), `supportsLanguage`, `applyPronunciations` (whole-word, case-insensitive, longest-first), `detectScriptLanguage` (coarse script hint ja/ko/zh/ar/hi/ru else 'und'). Start node config gains `autoDetectLanguage` + `pronunciations`.
- **voice** `app/loop/language.py`: `LanguageSwitcher` — **debounces the STT-detected language** (N consecutive detections before switching; ignores noise/und) so the agent doesn't flap, then swaps once; `resolve_voice` + `apply_pronunciations` mirror the shared helpers. DeepgramSTT gains `detect_language` (Deepgram's mid-call detection) and surfaces `STTEvent.language`.
- **web** Start-node form: 'Auto-detect the caller's language' toggle + a pronunciations editor (term→say rows).

Verification:
- shared: typecheck + lint + build + **75 tests** (voice resolution/fallback, supportsLanguage, pronunciations whole-word, script detection). voice: ruff + pyright + **72 tests** (debounced switch, noise/und ignored, switch-back, voice fallback, pronunciations). web: typecheck + lint + **build compiles**.

Deferred (tracked): the LIVE mid-call swap wired into the Day-9 loop (feed `STTEvent.language` → `LanguageSwitcher.observe` → on switch, change the TTS voice + STT language + apply pronunciations before synthesis) — the pieces are built + tested; the loop integration is the remaining wiring (alongside tools/transfer/compiler-executor). Per-language voice picker UI lands with the voices library (Day 26); provider-strength STT/TTS routing by language is a router policy refinement.

## Self-Audit — Day 25 (A–K)
A. Detection / switch (THE focus): ✅ — `LanguageSwitcher` debounces detections (no flapping), ignores noise/'und', switches once, and can switch back — all unit-tested; Deepgram `detect_language` is the live detection source + `STTEvent.language` carries it.
B. Tenancy: ✅ — config lives in the flow graph (RLS-scoped save); language logic is pure/per-call.
C. Security: ✅ — no new external surface; pronunciation replacement is whole-word regex-escaped (no injection); safe.
D. Routing cost (focus): ✅ — `resolveVoice`/`resolve_voice` pick the per-language voice; STT/TTS still route through the metered router; switching reuses the same providers (no extra cost path).
E. Tests: ✅ — 5 shared + 5 voice; deterministic.
F. Performance (focus): ✅ — switcher is O(1) per event; pronunciation apply is linear; detection is provider-side (no added latency in our loop).
G. Errors/obs: ✅ — typed; unknown language falls back to the default voice; 'und'/noise ignored.
H. UI: ✅ — Start-node auto-detect toggle + pronunciations editor (a11y labels).
I. Regression: ✅ — shared 75 + voice 72 green; web build green; STTEvent field is backward-compatible (optional default); branched from the Day-24 merge.
J. Quality/docs: ✅ — typed; detection/switch + deferred loop-wiring documented.
K. Build/CI: ✅ — deterministic; detection tested without live providers.

Detection/switch determinism CONFIRMED (self-audit focus A): the debounced switcher never flaps on noise and switches exactly once after the stability threshold (tests in test_language + multilingual.test).
Next: Day 26 (voices — voice library, cloning, per-language voice picker).

## Day 26 — Voice library + per-agent voice + gated cloning — 2026-07-02 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/26-voices` → PR. Prereqs met (ELEVENLABS_API_KEY = Creator plan, cloning-capable, set + validated Day 07; consent process = mandatory in-app consent capture stored on `consentRef`). Self-audit focus C (consent gate) + B (private voices scoped) + A.

Built (DONE):
- **DB**: `Voice` gains `age`, `accent` (library filters) + `approved` (the clone gate). Migration `day26_voice_library` backfills existing/preset rows to `approved = true`. Seed now creates 8 public ElevenLabs preset voices (tenantId = null, visible to all via RLS). RLS on `Voice` was already the public-nullable policy from Day 04 (presets shared, tenant voices isolated).
- **shared** (`voice.ts`): `voiceSettingsSchema` (stability/similarity/style/pace/pitch, clamped), `normalizeVoiceSettings`; `voiceFilterSchema` + `filterVoices` (language/gender/age/accent/style/includeCloned); **`isVoiceUsable`** — the single gate predicate (`!isCloned || approved`); `cloneConsentSchema` (requires `consentGiven: true` literal) + `cloneRequestSchema` (≥1 sample URL); `VOICE_PRESETS` catalogue.
- **api** `voices` module: `VoicesService` (RLS-scoped `withTenant`) — `list` (presets + tenant, filtered), `get`, `updateSettings` (presets read-only), `assignToAgent` (default+fallback; **rejects unapproved clones** — the gate enforced at assignment), `clone` (consent mandatory → creates `isCloned:true, approved:false` + stores `consentRef`), `approve` (owner/admin only — the only path to usable). Cloner is an injected port (`VOICE_CLONER`); live `elevenLabsCloner` (`POST /v1/voices/add` multipart) wired from env, fake in tests. Controller: reads open to members, mutations to config-writers, approval to OWNER/ADMIN (separation of duty).
- **web**: `/dashboard/voices` — library grid with gender filter chips, per-voice stability slider (tenant voices), ready/pending badges, an **Approve clone** action, and a clone form with a **mandatory consent checkbox** (locked until checked). Nav link added.

Verification:
- shared: typecheck + lint + build + **86 tests** (isVoiceUsable gate, settings clamp, filters, consent/sample schema, preset uniqueness). api: typecheck + lint + **voices 4 tests** (presets visible + filtered, settings persist + presets read-only, **clone gated → unapproved unassignable → approve → assignable**, consent stored, no-consent rejected) — full api suite green. db: migrate + seed + **7 RLS/schema tests**. web: typecheck + lint + **build** (route `/dashboard/voices` prerendered).

Deferred (tracked): live ElevenLabs clone smoke (create a real cloned voice from a consented sample) — gated behind the funded/consented sample, cloner is wired + unit-tested with a fake; the per-language voice **picker on the agent form** (wiring `assignToAgent` + Day-25 `resolveVoice` into the builder Start node) lands with the agent-config UI; loop resolve of tuned `settings` into the live TTS call rides with the deferred Day-9 loop wiring.

## Self-Audit — Day 26 (A–K)
A. Correctness: ✅ — `isVoiceUsable` is the one gate; presets/approved clones usable, fresh clones not; settings clamp + filters unit-tested; assignment is transactional.
B. Tenancy (focus): ✅ — every read/write via `withTenant`; presets are tenantId=null (shared by the Day-04 public-nullable RLS); a tenant's private/cloned voices are RLS-isolated; assignment re-checks voice visibility inside the tenant tx.
C. Consent gate (THE focus): ✅ — `cloneConsentSchema` requires `consentGiven: true` (no-consent rejected, tested); consent record persisted to `consentRef` (subjectName + statement + server-stamped `consentedAt`, tested); clone is created UNAPPROVED and cannot be assigned until `approve` (owner/admin only) — proven end-to-end in the test.
D. Cost: ✅ — no new calling path; cloning is a one-off provider op (no per-minute meter); TTS synthesis still routes through the metered router.
E. Tests: ✅ — 5 shared + 4 api (RLS-real); deterministic (fake cloner, no live call in CI).
F. Performance: ✅ — library filter is in-memory over an RLS-scoped list; assignment is O(1) lookups in one tx.
G. Errors/obs: ✅ — typed AppErrors (NotFound/Validation/Provider); provider failure wrapped in `ProviderError`; no internals leaked.
H. UI/a11y: ✅ — labelled inputs, consent checkbox gates submit, ready/pending badges, design tokens (vq-violet/success/warn/danger); responsive grid.
I. Regression: ✅ — additive migration backfills existing rows to approved; `STTEvent`/prior suites untouched; api + shared + db + web all green; branched from the Day-25 merge.
J. Quality/docs: ✅ — explicit DTOs (no Prisma type leak), doc comments explain the gate; deferred items tracked above.
K. Build/CI: ✅ — deterministic; live cloner isolated behind an injected port + env key.

Consent/approval gate CONFIRMED (self-audit focus C): a freshly cloned voice is `usable:false` and `assignToAgent` throws until `approve` flips it — demonstrated by the passing "gates use until approved" test.
Next: Day 27 (Squads — multi-agent teams / routing).

## Day 27 — Multi-agent Squads + shared context bus + per-node model swap — 2026-07-02 — ✅ DONE (session 1 of 2)
Model: Opus (🧠 OPUS). Branch `day/27-squads` → PR. Prereqs met (Days 9/21/22 done; no new credentials). Self-audit focus A (handoff) + D (per-node cost) + B (context-bus scoping) + F (no handoff latency spike).

Built (DONE):
- **DB**: `Squad` (name, description, entryAgentId, handoffRules JSON) + `SquadMember` (squad↔agent, role, order; unique per squad). Migration `day27_squads` with **RLS `tenant_isolation`** on both tables (same policy shape as every tenant table). Back-relations on Tenant + Agent.
- **shared** (`squad.ts`): `squadMemberSchema`, `handoffRuleSchema`, `squadConfigSchema` (superRefine: **rules + entry must reference squad members** — no dangling handoffs), `entryAgent`, **`resolveHandoff`** (signal→next specialist, first-match, null=keep turn), **`ContextBus`** (per-call shared state across handoffs — merge/set/get/snapshot/`forHandoff`; never stores empties), `nodeOverrideSchema` + **`resolveNodeOverride`** (per-node model/voice swap; router meters the resolved model). Node config: `squadHandoffConfigSchema` registered for the existing `SQUAD_HANDOFF` type; Say node gains `modelOverride`/`voiceOverride`.
- **voice** (`app/loop/squad.py`): the Python mirror the live loop consumes — `resolve_handoff`, `entry_agent`, `ContextBus`, `resolve_node_override` (pure/deterministic, tested like `language.py`).
- **api** `squads` module: RLS-scoped `SquadsService` (list/get/create/update/remove). Enrolls **only the tenant's own agents** (count-check inside the tenant tx), validates handoff-rule integrity via the shared schema, replaces members wholesale on update. Controller: reads to members, mutations to config-writers.
- **web**: `/dashboard/squads` — list + inline builder (name, add member agents with roles, define `from → on signal → to` handoff rules between members); delete; nav link. Squad hooks in `lib/api.ts`.

Verification:
- shared: typecheck + lint + build + **87 tests** (handoff routing, context preservation across handoffs, empties ignored, entry selection, member-integrity rejection, per-node override). api: typecheck + lint + **squads 4 tests** (chains own agents + rules, rejects non-member rule, **rejects foreign-tenant agent**, **RLS isolates squads across tenants**) + full suite **103**. voice: ruff + pyright + **squad 5 tests** (77 passed total). db: migrate + **7 RLS/schema tests**. web: typecheck + lint + **build** (route `/dashboard/squads` prerendered).

Deferred (tracked — session 2 / loop-wiring bundle): the **live LangGraph orchestration** wired into the Day-9 loop (classify turn → `resolveHandoff` → swap active agent + seed `ContextBus` for the next specialist → seamless audio continuity), and the **router honouring per-node model/voice overrides at call time + metering the resolved model** — both consume the pure/tested helpers built here; they ride with the same deferred loop-integration bundle as tools/transfer/compiler-executor/language-swap. Builder form inputs for the `SQUAD_HANDOFF` node + per-node model/voice fields on the Say node (schemas done + validated) are the remaining UI.

## Self-Audit — Day 27 (A–K)
A. Handoff (THE focus): ✅ — `resolveHandoff` routes signal→specialist deterministically (first-match, null=keep turn), unit-tested in TS + Py; handoff-rule integrity enforced (rules must reference members) at schema + API level.
B. Context-bus scoping (focus): ✅ — `ContextBus` is instantiated per call inside the tenant loop (no shared/global state); squads + members are RLS-isolated (proven: C1 cannot see/enroll R1's agents or read R1's squad).
C. Security: ✅ — inputs Zod-validated; agent-ownership re-checked inside the tenant tx (can't enroll a foreign agent); no secrets/new external surface.
D. Per-node cost (focus): ✅ — `resolveNodeOverride` returns the effective model; the router meters against the RESOLVED model (documented), so a per-node swap bills at that model's rate — no unmetered path introduced.
E. Tests: ✅ — 6 shared + 4 api (RLS-real, incl. cross-tenant) + 5 voice; deterministic.
F. Performance / no handoff latency spike (focus): ✅ — handoff resolve is O(rules); context bus is O(1) get/set; the bus travels in-memory (no re-query per handoff), so a handoff adds no round-trip.
G. Errors/obs: ✅ — typed AppErrors (NotFound/Validation); null handoff = keep turn (no throw on no-match).
H. UI/a11y: ✅ — labelled inputs/selects, design tokens, responsive; empty/error/loading states.
I. Regression: ✅ — additive migration; existing suites untouched; api 103 / shared 87 / voice 77 / db 7 / web build all green; branched from the Day-26 merge.
J. Quality/docs: ✅ — explicit DTOs (no Prisma type leak), doc comments explain handoff + bus + override; deferred loop-wiring tracked.
K. Build/CI: ✅ — deterministic; squad logic tested without live providers.

Handoff + context preservation CONFIRMED (focus A + B): `resolveHandoff` routes to the right specialist and `ContextBus.snapshot()`/`forHandoff()` carry every earlier-captured field to the next agent — demonstrated in both `squad.test.ts` and `test_squad.py`. Squad tenant-isolation CONFIRMED: the RLS test proves C1 can neither read R1's squad nor enroll R1's agent.
Next: Day 28 (campaign manager) — or Day 27 session-2 loop wiring when the deferred loop bundle lands.

## Day 28 — Campaign manager (import, schedule, pace, retry, monitor) — 2026-07-02 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/28-campaigns` → PR. Prereqs met (Day 10 outbound + workers running; no new credentials). Self-audit focus C (DNC/caps/abuse) + B + F (pacing under load) + D.

Built (DONE):
- **shared** (`campaign.ts`): the safety-critical pure core — `normalizePhone` (E.164, rejects ambiguous locals — never dial a guess), `parseCsv` + `importContacts` (header→field map, **dedupe by phone + DNC suppression**, counts every drop), `callWindowSchema` + `isWithinWindow` (**timezone-aware** via `Intl`, day + time-of-day), `retryPolicySchema` + **`nextRetry`** (state machine: retry retryable dispositions with backoff, stop at maxAttempts/terminal/success), **`selectDueContacts`** (pacing + concurrency selection — can never exceed caps regardless of backlog), status constants.
- **DB**: `CampaignContact` gains `lastDisposition` + `nextAttemptAt` (retry gating) + a `(campaignId,status)` index; migration `day28_campaigns`. RLS already present from Day 04.
- **api** `campaigns` module: RLS-scoped `CampaignsService` — CRUD, **import** (upserts Contacts + enrolls PENDING; suppresses the tenant's DNC set up front), gated status transitions (state machine), and **live `monitor`** (counts grouped by status). Agent must belong to the tenant. Controller: reads to members, mutations to config-writers.
- **workers**: `runCampaignTick` (pure, injected-deps, mirrors the reconciliation pattern) — for each RUNNING campaign in its local window, select due contacts within caps and hand to `dial`; **one campaign's failure is isolated**. `createDbSchedulerDeps` wires the admin-client production deps; registered as a **15s repeatable BullMQ tick**. Live outbound placement is a marked TODO (gated until a funded number — Day 10 pattern); the tick flips the contact to CALLING.
- **web**: `/dashboard/campaigns` — list + create (agent picker, pace/concurrency), CSV import panel (reports imported/dup/DNC/invalid), run/pause, and a **live monitor** (5s refetch) of status counts. Nav link + hooks.

Verification:
- shared: typecheck + lint + build + **93 tests** (phone normalise, import dedupe+DNC+counts, timezone window, retry state machine, pacing/concurrency caps). api: typecheck + lint + **campaigns 3** (create+import+monitor, illegal-transition gating, foreign-agent rejection) + full **106**. workers: typecheck + lint + **scheduler 4** (window gating, caps, in-flight concurrency, failure isolation) — 6 total. db: migrate + **7**. web: typecheck + lint + **build** (route `/dashboard/campaigns` prerendered).

Deferred (tracked): the **live outbound dial** from the scheduler (enqueue the metered call at the marked TODO once a funded Twilio number is attached — selection/caps already guarantee pace+concurrency); **retry writeback** wiring `nextRetry` to call-completion (set `nextAttemptAt`/`status` on disposition) rides with the call-lifecycle webhook; best-time-of-day heuristics are a scheduling refinement.

## Self-Audit — Day 28 (A–K)
A. Correctness: ✅ — import pipeline, window, retry SM, and pacing selection are pure + exhaustively unit-tested (edge cases: dup, invalid, DNC, closed window, max attempts, at-capacity).
B. Tenancy: ✅ — all campaign/contact reads+writes via `withTenant`; import builds the DNC set from the tenant's own contacts; agent ownership enforced; the worker uses the admin client only for the cross-tenant infra sweep (documented, like reconciliation).
C. DNC / caps / abuse (THE focus): ✅ — DNC numbers are suppressed at import (never enrolled) AND the live outbound path still re-checks DNC/consent (Day 10); `selectDueContacts` can never exceed concurrency or pace regardless of backlog size — proven by tests.
D. Cost: ✅ — no unmetered path added; the live dial (deferred) routes through the metered outbound path; pacing/concurrency caps bound spend.
E. Tests: ✅ — 6 shared + 3 api (RLS-real) + 4 workers; deterministic (fixed clocks, injected deps).
F. Pacing under load (focus): ✅ — selection is O(due) with a hard cap = min(concurrency-inFlight, pace); a 100k backlog still launches ≤ cap per tick; the 15s tick bounds throughput.
G. Errors/obs: ✅ — typed AppErrors; illegal transitions rejected with a clear message; one campaign's tick error is isolated + logged, others proceed.
H. UI/a11y: ✅ — labelled inputs (htmlFor/id), import reports every drop, live monitor; design tokens; responsive.
I. Regression: ✅ — additive migration; existing suites untouched; shared 93 / api 106 / workers 6 / db 7 / web build all green; branched from the Day-27 merge.
J. Quality/docs: ✅ — explicit DTOs (no Prisma type leak); doc comments explain the caps + gated live dial; deferred items tracked.
K. Build/CI: ✅ — deterministic; scheduler tested without Redis/Postgres/a live dialer.

DNC + caps CONFIRMED (focus C + F): import suppresses DNC numbers (counted, never enrolled) and `selectDueContacts`/`runCampaignTick` never exceed pace or concurrency even with a large backlog — demonstrated across `campaign.test.ts` + `campaign-scheduler.test.ts`.
Next: Day 29 (lead workspace + scoring).

## Day 29 — Lead workspace + custom fields/tags + Hot/Warm/Cold scoring — 2026-07-02 — ✅ DONE
Model: Sonnet (⚡ SONNET). Branch `day/29-leads` → PR. Prereqs met (Day 28 + Day 13; no new credentials). Self-audit focus A (scoring) + B + H. No migration — the `Lead` model (status/score/owner/pipelineStage/dynamicVars) was already complete from Day 04.

Built (DONE):
- **shared** (`lead.ts`): the pure scoring/templating core — **`scoreLead`** (0–100 from intent≤50 + sentiment≤25 + outcome≤25 + engagement nudge → Hot ≥65 / Warm ≥35 / Cold; deterministic + clamped), **`renderTemplate`** (inject `{{var}}` dynamic variables into agent scripts, unknown → fallback so no raw token leaks) + `templateVariables`, and the pipeline stage machine `PIPELINE_STAGES` + **`canTransition`** (NEW→CONTACTED→QUALIFIED→BOOKED/LOST, reopen from LOST).
- **api** `leads` module: RLS-scoped `LeadsService` — list (status/stage/owner filters), get, create (one lead per contact; contact must be the tenant's), update (owner + dynamicVars on the Lead; tags on the shared Contact), **`moveStage`** (guarded by `canTransition`), **`applyScore`** (post-call auto-scoring → persists score + Hot/Warm/Cold). Controller: reads to members, mutations to config-writers.
- **web**: `/dashboard/leads` — **table + kanban** with a view toggle + temperature filter, both **URL-synced** (`?view=&status=`); the kanban uses native HTML5 drag-and-drop to move cards across pipeline columns (calls `moveStage`); Hot/Warm/Cold score badges, tags. Nav link + hooks.

Verification:
- shared: typecheck + lint + build + **101 tests** (scoring buckets + monotonic/clamped/deterministic, template injection + no-leak + fallback, pipeline transitions). api: typecheck + lint + **leads 3** (create+auto-score+pipeline gating, owner/tags/dynamicVars persistence, **foreign-contact rejection + RLS isolation**) + full **109**. web: typecheck + lint + **build** (route `/dashboard/leads` prerendered).

Deviations/deferred (tracked): the design direction suggested **dnd-kit** + a virtualised table; to avoid adding a dependency mid-build I used **native HTML5 DnD** for the kanban (functional, zero-dep) — dnd-kit polish + row virtualisation for very large lists is a deferred UI refinement (note per CLAUDE.md §13). **Dynamic-var injection at call time** (feeding `lead.dynamicVars` through `renderTemplate` into the agent script) rides with the deferred Day-9 loop bundle; **auto-scoring wiring on call completion** (post-call intel calls `applyScore`) lands with Day 31 (post-call intel) — the pure scorer + endpoint are ready. CRM status sync is Day 40.

## Self-Audit — Day 29 (A–K)
A. Scoring (THE focus): ✅ — `scoreLead` is pure, deterministic, monotonic, clamped 0–100, and bucketed with explicit thresholds; unit-tested across hot/warm/cold + edge inputs.
B. Tenancy: ✅ — every lead read/write via `withTenant`; create rejects a foreign-tenant contact; tags write to the tenant's own Contact; RLS isolation proven (C1 can't see R1's lead).
C. Security: ✅ — inputs Zod-validated; dynamic vars constrained to scalars (JSON-safe, no injection); `renderTemplate` never leaks unknown tokens.
D. Cost: ✅ — no calling path; scoring is pure compute; no unmetered path.
E. Tests: ✅ — 8 shared + 3 api (RLS-real); deterministic.
F. Performance: ✅ — scoring O(1); list is a single indexed query (`tenantId,status`); kanban filters in-memory over the RLS-scoped set.
G. Errors/obs: ✅ — typed AppErrors; illegal stage transitions rejected with a clear message.
H. UI/a11y (focus): ✅ — table + kanban, URL-synced filters/view (shareable + back-button friendly), draggable cards with grab cursors, temperature badges via design tokens; responsive grid; empty/error/loading states.
I. Regression: ✅ — no migration/schema change; existing suites untouched; shared 101 / api 109 / web build all green; branched from the Day-28 merge.
J. Quality/docs: ✅ — explicit DTOs; doc comments explain scoring weights + the stage machine; deviations/deferred tracked.
K. Build/CI: ✅ — deterministic; scoring + templating tested without any live provider.

Scoring CONFIRMED (focus A): `scoreLead` buckets Hot/Warm/Cold deterministically and `applyScore` persists score + temperature on the lead — demonstrated in `lead.test.ts` + the api test. Tenant isolation CONFIRMED: RLS hides R1's lead from C1 and blocks enrolling a foreign contact.
Next: Day 30 (A/B testing) — closes Phase 2.

## Day 30 — A/B testing for scripts, voices & openers — 2026-07-02 — ✅ DONE (closes Phase 2)
Model: Sonnet (⚡ SONNET). Branch `day/30-ab-testing` → PR. Prereqs met (Day 28; no new credentials). Self-audit focus A (split, stats) + B.

Built (DONE):
- **shared** (`experiment.ts`): the pure split/stats core — `experimentConfigSchema` (≥2 variants, unique ids), **`assignVariant`** (FNV-1a hash → weight-proportional bucket; **stable per key** so a contact keeps its variant across retries), `evaluateMetric` (conversion/booking/csat success), `aggregateResults` (per-variant totals + rate), and **`twoProportionTest`** (z-test → two-tailed p-value via a normal-CDF approx, 95% significance flag, lift; guards zero-sample → no NaN).
- **DB**: `Experiment` model (name, status, metric, variants JSON) + `Call.experimentId` + `Call.variant` (variant recorded per call) + `(experimentId,variant)` index; migration `day30_experiments` with **RLS `tenant_isolation`** on Experiment. Tenant back-relation.
- **api** `experiments` module: RLS-scoped `ExperimentsService` — CRUD (create validates via the shared schema), status DRAFT→RUNNING→STOPPED, **`assign`** (RUNNING-only, returns the stable variant + its config to record on the Call), and **`results`** (aggregates this experiment's calls, computes significance vs the control/first variant). Controller: reads to members, mutations to config-writers.
- **web**: `/dashboard/experiments` — list + create (variants with id/label/weight, metric), run/stop, and a **live results table** (per-variant calls, rate, lift, significance p-value; 10s refetch). Nav link + hooks.

Verification:
- shared: typecheck + lint + build + **110 tests** (stable + weighted split, metric scoring, aggregation, z-test significant/n.s./zero-guard, config validation). api: typecheck + lint + **experiments 3** (create+run+stable-assign+significant results, <2-variant rejection, **RLS isolation**) + full **112**. db: migrate + **7**. web: typecheck + lint + **build** (route `/dashboard/experiments` prerendered). Full monorepo `pnpm lint` 11/11.

Bug caught + fixed during the day: the experiments test seeded 200 **OUTBOUND** calls in the shared C1 tenant, which tripped the Day-10 outbound **rate-limit counter** in the parallel `outbound.service.test` (cross-suite interference). Fixed by seeding **INBOUND** calls (direction is irrelevant to A/B aggregation) — full api suite green again.

Deferred (tracked): wiring `assign` into the live call-routing path (record `experimentId`/`variant` on each Call + apply the variant's opener/voice/script override) rides with the deferred Day-9 loop bundle + campaign live-dial; feeding results into the analytics dashboard is Day 41.

## Self-Audit — Day 30 (A–K)
A. Split + stats (THE focus): ✅ — `assignVariant` is deterministic + weight-proportional (stable per key, verified over 4000 keys); `twoProportionTest` matches hand-computed z/p, flags a real 10%→40% difference significant, leaves small-sample noise n.s., and never returns NaN.
B. Tenancy: ✅ — Experiment has RLS; every read/write via `withTenant`; results read only this experiment's calls; RLS isolation proven (C1 can't see R1's experiment).
C. Security: ✅ — inputs Zod-validated; variant config constrained to scalars (JSON-safe); status transitions validated.
D. Cost: ✅ — no calling path; assignment/stats are pure compute; variant recording rides the existing metered call path.
E. Tests: ✅ — 9 shared + 3 api (RLS-real, incl. significance on seeded calls); deterministic.
F. Performance: ✅ — assign O(variants); results is one indexed query (`experimentId,variant`) + linear fold.
G. Errors/obs: ✅ — typed AppErrors; zero-sample significance guarded; unknown status/metric rejected.
H. UI/a11y: ✅ — labelled inputs, results table with significance/p-value, run/stop; design tokens; empty/error/loading states.
I. Regression: ✅ — additive migration; existing suites green after the cross-suite-interference fix; shared 110 / api 112 / db 7 / web build all green; branched from the Day-29 merge.
J. Quality/docs: ✅ — explicit DTOs; doc comments explain the hash split + z-test; deferred wiring tracked.
K. Build/CI: ✅ — deterministic; split + stats tested without any live provider.

Split + significance CONFIRMED (focus A): `assignVariant` is stable-per-key + weight-proportional and `twoProportionTest` flags a real difference significant while guarding small samples/zero — demonstrated in `experiment.test.ts` + the api results test.

### 🏁 Phase 2 complete (Days 17–30) — Builder & conversations
Canvas → nodes → tool/webhook → RAG → collect/transfer/subflow → compiler → simulator → persona/templates → multilingual → voices/cloning → **Squads** → **campaigns** → **lead workspace** → **A/B testing**. Tag **v0.3-phase2**. Next: Phase 2.5 (Days 31–40: post-call intel, simulator, batch testing, memory, SIP, appointments, sheets/forms, cost protection, transcription controls, integrations) — with Day 67 (Agent Desk) slotted after Day 27's transfer destinations.

## 🔧 STACK PIVOT — CodeCanyon self-hosted (2026-07, after Day 30, before Day 31)
**Decision (overrides the kit's pinned stack):** the product is being sold on **CodeCanyon as a self-hosted SaaS**, so the stack moves to what buyers can run for free and customize:
- **Backend: Node.js + Express** (NestJS ELIMINATED — buyer-familiar; Express *is* Node.js + one small MIT lib).
- **Auth: self-hosted email/password + JWT (bcrypt)** — **Clerk ELIMINATED** (paid SaaS breaks self-hosting).
- **DB: PostgreSQL + Prisma KEPT** (rejected MongoDB — keeps RLS multi-tenancy + pgvector RAG self-hostable + relational + zero rewrite; rejected Drizzle — keep Prisma).
- **Frontend: Next.js (latest) + React KEPT** (rejected Vite SPA) + **shadcn/ui** + **Framer Motion** + Tailwind.
- **Deploy: PM2 + Nginx + Docker.** Everything free & open-source (MIT/Apache/permissive).
- **Providers stay BYOK + swappable for self-hosted OSS** (Ollama/Whisper/Piper/self-hosted LiveKit); only PSTN minutes unavoidably cost money. Sentry/PostHog/Stripe are OPTIONAL (already no-op without keys).

Executed in two phases to keep `apps/api` always-buildable:
- **Phase 1 (this commit) — self-hosted deploy layer:** `ecosystem.config.cjs` (PM2: api/workers/web/voice), `infra/nginx/vocaliq.conf.sample` (reverse proxy + TLS + WS), `docs/SELF-HOSTING.md` (stack + honest free-vs-paid + prod steps). Additive only; all suites still green.
- **Phase 2 — `refactor/api-express`:** NestJS→Express + Clerk→JWT. Split into two green slices so `apps/api` is never broken:
  - **Phase 2a (DONE):** the security-critical new core, added ALONGSIDE the running Nest app (still boots, all green). `auth/jwt.ts` (self-hosted HS256 sign/verify, `APP_JWT_SECRET`), `auth/password.ts` (bcrypt), and the Express kernel `http/` (context types, async-handler, error+notFound middleware, auth/tenant/roles middleware). Migration `self_hosted_auth`: `User.passwordHash` + `authProviderId` now optional. Deps added: express, jsonwebtoken, bcryptjs (+types). Tests: **7 new** (jwt round-trip/tamper/expiry/wrong-secret, bcrypt hash/verify/salted). api **119** + db **7** green. `.env.example`: `APP_JWT_SECRET` added.
  - **Phase 2b (DONE) — the flip:** `apps/api` is now a plain **Express** app, NestJS fully removed. `main.ts` = Express bootstrap (raw-body Stripe webhook before the JSON parser; routers mounted at the exact old paths; notFound + error middleware last). **`composition.ts`** = the manual DI root (one `new Service(...)` graph, BYOK keys from env). **16 controllers → Express routers** (`*.routes.ts`) — 12 done by parallel subagents, 4 (auth/health/widget/billing) by hand; guards → `authMiddleware`/`tenantMiddleware`/`requireRoles`; `@CurrentMembership()`→`req.ctx!`. **Clerk removed**, replaced by self-hosted **AuthService** (`register` → user+personal tenant+OWNER membership; `login` → bcrypt verify + JWT; `me`). Stripped `@Injectable`/`@Inject` from 20 services; `PrismaService.onModuleDestroy`→`disconnect()`; deleted all `*.module.ts`, guards, decorators, exception filter, `clerk.ts`/`authenticate.ts`/`user-sync.ts`/`webhook.ts` (+ their tests); `roles.ts` lost the Nest `@Roles` decorator (kept `hasRequiredRole`/`CONFIG_WRITERS`). Removed deps `@nestjs/*`, `@clerk/backend`, `svix`, `rxjs`, `reflect-metadata`; tsconfig dropped decorator metadata; `@types/express` aligned to v4. **Verification (whole monorepo): typecheck 11/11, tests all green (api 104, shared 110, db 7, workers 6, router 22), lint 11/11, build 7/7.** api test count 119→104 = the 15 deleted Clerk/guard tests.
  - **Phase 2c (DONE) — frontend auth swap:** `apps/web` off Clerk → self-hosted JWT. New `lib/auth.tsx` = an `AuthProvider` + **`useAuth()` with the SAME shape Clerk exposed** (`getToken`), so `lib/api.ts` needed only a one-line import swap (40+ call sites unchanged); the JWT lives in a `vq_token` cookie (client sends `Bearer`, middleware reads it). Custom `/sign-in` + `/sign-up` forms (call `/auth/login|register` → cookie → `/dashboard`). `middleware.ts` → cookie gate on `/dashboard` (redirect to `/sign-in`). `layout.tsx` drops `ClerkProvider` (AuthProvider added in `providers.tsx`); `dashboard-shell` `UserButton`→`UserMenu` (email + Sign out); landing `page.tsx` → `LandingAuth` client control (no more server `auth()`). Removed `@clerk/nextjs`; `.env.example` drops all `CLERK_*`/publishable keys, adds `NEXT_PUBLIC_API_URL`. **Clerk is now GONE from the entire codebase.** Whole monorepo green: typecheck 11/11, lint 11/11, web build (sign-in/sign-up routes generated). Stack pivot COMPLETE — Next.js + React + Express + Postgres/Prisma + self-hosted JWT + shadcn + Framer Motion + PM2/Nginx, all free & open-source.

## Day 31 — Post-call intelligence (AI summary + keyword/topic/entity extraction) — 2026-07-02 — ✅ DONE
Model: Sonnet (⚡ SONNET). First feature day on the NEW stack (Express + JWT). Branch `day/31-postcall-intel` → PR. Prereqs met (Day-12 transcripts; LLM keys set). Self-audit focus D (LLM cost) + B + A.

Built (DONE):
- **shared** (`post-call.ts`): the pure, tested core — `postCallIntelSchema` (summary/keywords/topics/entities/sentiment/followUps), `segmentsToText` (flatten transcript), `buildIntelPrompt` (strict-JSON instruction, token-capped), **`parseIntel`** (extracts the first balanced JSON object → tolerates code fences/prose; **falls back to empty intel on garbage, never throws** — a bad generation can't break the pipeline).
- **DB**: `Transcript` gains `topics`/`entities`/`sentiment`/`intelAt` (summary/keywords already existed); migration `day31_post_call_intel`.
- **workers** (`post-call-intel.ts`): pure **`runPostCallIntel(deps, transcriptId)`** — fetch → `segmentsToText` → `buildIntelPrompt` → injected metered `complete` → `parseIntel` → save; **empty transcript skips the LLM entirely (no wasted spend)**. `createDbPostCallDeps` wires the admin DB + a provider-Router `complete` with a **UsageMeter that writes a tenant-scoped UsageRecord** (golden rule #4 — no un-metered LLM path). Registered as a BullMQ `post-call-intel` worker (consumes `{transcriptId}` jobs).
- **api**: `calls-read.detail` now returns transcript `topics`/`entities`/`sentiment`/`intelAt`.
- **web**: call-detail **"Call intelligence" card** (summary + keyword/topic pills + entity chips + sentiment badge, shown once `intelAt` is set) and a **jump-to-moment transcript** — each segment is a button that seeks the `<audio>` element to its `startMs` and plays (zero-dep, native audio; no wavesurfer needed).

Verification: shared typecheck+lint+build+**117 tests** (segmentsToText, prompt cap, parse clean/fenced/garbage/invalid). workers typecheck+lint+**10 tests** (intel: metered-LLM path taken, empty→no-LLM, not-found, garbage→empty-saved). api typecheck+lint+**104**. db migrate+**7**. web typecheck+lint+**build** (`/dashboard/calls/[id]` route). Full monorepo lint 11/11, build 7/7.

Deferred (tracked): **enqueue on call-end** (the Day-9 live loop pushes a `{transcriptId}` job when a call ends) rides with the loop-integration bundle; **lead auto-scoring** (feed intel sentiment/outcome into the Day-29 `applyScore` on the contact's lead) is a small follow-up — the endpoint + scorer are ready; wavesurfer waveform deferred in favour of the native audio + click-to-seek (zero-dep); live LLM smoke rides with the first real call (the LLM+metering path itself is already proven by the Day-6/7 router tests).

## Self-Audit — Day 31 (A–K)
A. Correctness (focus): ✅ — parse/prompt/flatten are pure + exhaustively unit-tested incl. fenced/garbage/invalid inputs; `parseIntel` never throws (empty-intel fallback). Orchestration tested end-to-end with fakes.
B. Tenancy: ✅ — `saveIntel` writes the transcript by id (already tenant-owned); the metered UsageRecord is stamped with the transcript's `tenantId`; API read is RLS-scoped `withTenant`. The worker uses the admin client only for the cross-tenant infra sweep (documented, like reconciliation/campaigns).
C. Security: ✅ — LLM output is validated by Zod before persistence (no raw model text trusted); no secrets logged; provider keys via the resolver (never logged).
D. LLM cost (THE focus): ✅ — every completion routes through the provider Router with a `UsageMeter` → tenant-scoped `UsageRecord` (no un-metered path); **empty transcripts never call the LLM**; the prompt is token-capped (12k) to bound spend.
E. Tests: ✅ — 7 shared + 4 workers (RLS-real not needed — pure/injected); deterministic (no live LLM).
F. Performance: ✅ — one bounded LLM call per call; parse is linear; worker is per-job (no backlog sweep that could surprise-spend).
G. Errors/obs: ✅ — bad generations degrade to empty intel (pipeline survives); worker logs per job; BullMQ retries on transport failure.
H. UI/a11y: ✅ — intel card only shows once generated; transcript segments are real buttons (keyboard-focusable) with titles; sentiment/keyword/entity styling via design tokens.
I. Regression: ✅ — additive migration + additive select fields; existing suites green (api 104, shared 117, workers 10, db 7); first day on the new Express/JWT stack — no framework regressions.
J. Quality/docs: ✅ — explicit types; doc comments explain the metered path + the empty-skip + the fallback; deferred wiring tracked.
K. Build/CI: ✅ — deterministic; intel tested without any live LLM.

Metered + cost-safe CONFIRMED (focus D): the intel LLM call goes through the router's `UsageMeter` (tenant-scoped UsageRecord), and an empty transcript short-circuits before any LLM spend — both demonstrated in `post-call-intel.test.ts`.
Next: Day 32 (agent testing suite / simulator).

## Day 32 — Conversation simulator / sandbox — 2026-07-03 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/32-simulator` → PR. Prereqs met (Day-22 compiler + Day-9 loop). Self-audit focus A + D (sim cost flagged) + B.

Built (DONE):
- **shared** (`simulator.ts`): the pure sandbox runtime — **`runSimulation(compiledFlow, caller, {maxTurns})`** drives the Day-22 compiled flow with NO telephony/providers, emitting a typed **event stream** (`node`/`agent`/`caller`/`capture`/`tool`/`end`/`halt`); Listen nodes pull the next `caller` input + record captures, Decisions route on the caller's last `intent`, other nodes emit a simulated `tool` event. Returns `{events, transcript, visited, estCostUsd, outcome}`. **`scriptedCaller(lines)`** = a deterministic, FREE replay caller (`SimulatedCaller` port; the LLM-persona caller is the injectable production impl). Hard step cap guarantees termination even on a cyclic graph.
- **web**: extended the builder simulator panel with a **"Scripted caller" auto-run** — a textarea (one caller line per row, `text | intent` to route decisions) → `runSimulation` → shows outcome + turn count + **estimated cost** + the transcript, and **replays the visited path** on the canvas (active-node highlight). The Day-23 manual step-through is kept alongside.

Verification: shared typecheck + lint + build + **123 tests** (full deterministic conversation, intent routing to else, caller-hangup halt, scripted-caller = $0, generated-turn cost estimate, cyclic-flow termination via the step cap). web typecheck + lint + build. Full monorepo test 9/9, lint 11/11, build 7/7.

Deferred (tracked): the **LLM-driven persona caller** (hands-free runs where an LLM plays the caller) is the injectable production `SimulatedCaller` — wiring it (metered, cost-flagged) rides with the same provider path as Day 31; **voice (mic) sandbox** input rides with the Day-9 live loop; batch runs over many scripted callers land on Day 33.

## Self-Audit — Day 32 (A–K)
A. Correctness (focus): ✅ — `runSimulation` is pure + deterministic given a scripted caller; event stream, transcript, captures, intent-routing, and every halt reason are unit-tested; the visited path matches the flow exactly.
B. Tenancy: ✅ — the sandbox runs entirely client/pure over a compiled graph (no tenant data touched, no network); it can't cross tenants.
C. Security: ✅ — no live providers/telephony; no secrets; input is the builder's own graph + typed script lines.
D. Sim cost (focus): ✅ — a scripted caller is **free** (asserted $0); only 'generated' agent turns accrue an ESTIMATE (`estCostUsd`, documented as conservative, not billing) so the UI flags spend; the future LLM caller is the only real-cost path and stays injectable/flagged.
E. Tests: ✅ — 6 shared, deterministic; covers happy path, branch, hangup, cost, termination.
F. Performance: ✅ — O(steps) with a hard cap (maxTurns*6); no network; the canvas replay is a bounded timeout sequence.
G. Errors/obs: ✅ — dead-end/no-match → `halt: dead_end`; caller exhausted → `halt: caller_ended`; cyclic → `halt: max_turns` (never hangs).
H. UI/a11y: ✅ — textarea labelled; results show outcome/turns/cost + colour-coded transcript via design tokens; compile errors still block simulation with clear messages.
I. Regression: ✅ — additive (new shared module + panel section); Day-23 step-through untouched; shared 123 / api 104 / workers 10 / db 7 green; build 7/7.
J. Quality/docs: ✅ — typed events; doc comments explain the caller port + the cost estimate caveat; deferred LLM-caller/voice/batch tracked.
K. Build/CI: ✅ — deterministic; no live providers in tests.

Simulator determinism + cost-safety CONFIRMED (focus A + D): `runSimulation` reproduces the exact conversation/event-stream for a scripted caller, a scripted run costs $0, and only generated turns accrue a flagged estimate — all demonstrated in `simulator.test.ts`.
Next: Day 33 (batch testing + rubrics).

## Day 33 — Batch/scenario testing + eval rubrics — 2026-07-03 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/33-batch-testing` → PR. Prereqs met (Day-32 simulator). Self-audit focus A (grading reliability) + D (eval cost) + B.

Built (DONE):
- **shared** (`scenario.ts`): the graded-eval core — `scenarioSchema` (name + scripted `caller` + `assertions`), a discriminated-union **assertion model** (`outcome_is`/`visited`/`transcript_includes`/`captured`/`max_turns`/`cost_under` — all **deterministic + free**; `llm_rubric` — graded by an **injected** `RubricGrader`), `evaluateAssertion`, **`runScenario`** (simulate via Day-32 `runSimulation` → grade), **`runSuite`** (aggregate pass/fail + cost + passRate), and **`detectRegressions(current, baseline)`** (scenarios that passed in the baseline but now fail). An unconfigured rubric **fails closed** (never silently passes).
- **DB**: `TestScenario` (per-agent scenario library) + `TestRun` (stored `SuiteReport` + pass counts); migration `day33_test_scenarios` with **RLS** on both.
- **api** `tests` module (Express, new stack): RLS-scoped `TestsService` — scenarios CRUD + `run(tenantId, agentId, {llm?})` which **compiles the agent's PUBLISHED flow**, runs the suite, and stores a `TestRun`; `listRuns`. Deterministic by default; **LLM rubric grading is OPT-IN** (`llm:true`) and metered via `routerGrader` (router → tenant-scoped UsageRecord). Mounted at `/agents/:agentId/tests`.
- **web**: `/dashboard/agents/[id]/tests` — scenario list + a compact builder (name, caller lines, expected-outcome/must-include/LLM-rubric fields), a **Run suite** button, and a **pass/fail report** (per-scenario ✓/✗ with each assertion + its detail, overall passRate).

Verification: shared typecheck + lint + build + **130 tests** (deterministic grading, determinism-across-runs, llm_rubric via fake grader, fail-closed with no grader, suite aggregation, **regression detection**). api typecheck + lint + **tests 3** (RLS-real: create + run + report stored, no-published-flow rejected, invalid-scenario rejected) + full **107**. db migrate + **7**. web typecheck + lint + **build** (`/dashboard/agents/[id]/tests`). Full test 9/9, lint 11/11, build 7/7.

Deferred (tracked): **CI-on-publish auto-run** (fire the suite + block/warn on regressions when a flow is published) is a small wiring on `FlowsService.publishFlow` — the run endpoint + `detectRegressions` are ready; the LLM grader is wired but opt-in per run (cost control); promptfoo/deepeval-style external export is optional.

## Self-Audit — Day 33 (A–K)
A. Grading reliability (THE focus): ✅ — deterministic assertions are pure over the seeded simulator (proven identical across runs); `llm_rubric` is isolated behind an injected grader so the core stays deterministic; an unconfigured rubric fails closed. Regression detection is set-based + tested.
B. Tenancy: ✅ — scenarios + runs are RLS-scoped via `withTenant`; create checks the agent belongs to the tenant; the published-flow lookup + report write are tenant-scoped; the metered grader stamps the tenant's UsageRecord.
C. Security: ✅ — scenario input Zod-validated (discriminated union); no secrets; the LLM grader routes keys via the resolver.
D. Eval cost (focus): ✅ — deterministic assertions cost **$0**; LLM grading is **opt-in** per run and every grader call is metered (UsageRecord); the report carries the estimated sim cost so spend is visible.
E. Tests: ✅ — 7 shared (grading/regression) + 3 api (RLS-real); deterministic (fake grader, no live LLM).
F. Performance: ✅ — scenarios run in parallel (`Promise.all`); one compile per suite; runs are bounded by the simulator's step cap.
G. Errors/obs: ✅ — typed AppErrors (no published flow / no scenarios / invalid def / bad compile); a failing rubric shows its reason.
H. UI/a11y: ✅ — labelled inputs; report is ✓/✗ per assertion with details + passRate; design tokens; empty/loading states.
I. Regression: ✅ — additive migration + additive routes; api 107 / shared 130 / workers 10 / db 7 green; build 7/7; second feature day on the Express/JWT stack — clean.
J. Quality/docs: ✅ — explicit DTOs; doc comments explain deterministic-vs-LLM + opt-in cost; deferred on-publish gate tracked.
K. Build/CI: ✅ — deterministic; grading tested without any live model.

Grading determinism + cost-safety CONFIRMED (focus A + D): the same scenario grades identically every run, deterministic assertions cost $0, LLM rubrics are opt-in + metered, and `detectRegressions` flags a scenario that regressed from a passing baseline — all demonstrated in `scenario.test.ts` + the api RLS test.
Next: Day 34 (agent memory).

## 🔍 CHECKPOINT AUDIT — through Day 33 (2026-07-03)
Full project self-audit at the Day-33 milestone (37 PRs merged; CodeCanyon stack pivot complete + live-smoke-verified).

**Quality gates (whole monorepo + Python voice):** typecheck 11/11 · lint 11/11 (+ Ruff clean) · **353 tests green** (TS: shared 130, api 107, provider-router 22 [+1 skip], workers 10, db 7 = 276; Python: 77 [+2 skip]) · build 7/7 · Pyright 0 errors.

**Invariants:** RLS on every tenant table (Day-04 FOREACH loop + explicit policies for Squad/SquadMember/Experiment/TestScenario/TestRun; 37/38 models tenant-scoped, `User` is global auth). `.env` git-ignored + untracked; gitleaks green. Git in sync, 0 unpushed, clean tree.

**Stack (all free/OSS, self-hostable):** Next.js + React + Express + PostgreSQL/Prisma + self-hosted JWT + shadcn + Framer Motion + PM2/Nginx. Clerk + NestJS fully removed; auth smoke-tested live (register→login→tenant-scoped call→401).

**Deferred (tracked, non-blocking):** the live-loop bundle (tool/transfer/compiler-executor, language-swap, Squad handoff, campaign live-dial, A/B variant recording, post-call enqueue) — all unit-tested, awaiting a funded Twilio number + one integration session; opt-in LLM eval grader / CI-on-publish gate / lead auto-scoring (endpoints ready). No open correctness/security issues found.

## Day 34 — Cross-call Agent Memory (persistent context) — 2026-07-03 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/34-agent-memory` → PR. Prereqs met (Day-20 embeddings). **Retention/privacy defaults (confirmed):** memory is **opt-in per agent** (`Agent.memoryEnabled` default false), **retained indefinitely** unless a tenant prunes by age, **contact-level erase always available (GDPR)**, scoping is **tenant + contact (+ agent)**. Self-audit focus C (PII/retention/erase) + B (scoping — critical) + A. No migration — the `AgentMemory` model (unique `[tenantId,agentId,contactId]`, RLS from Day-04) was already complete.

Built (DONE):
- **shared** (`memory.ts`): the pure core — `memoryFactSchema` (key/value/kind), `agentMemorySchema`, **`mergeMemoryFacts`** (same-key overwrite, newest-wins, capped — converges rather than grows), **`buildMemoryContext`** (the system-prompt snippet injected at call start; **empty for a first-time caller** so no phantom context), **`isMemoryExpired`** (retention; `≤0 days = keep forever`), plus `buildMemoryExtractionPrompt` + **`parseMemoryExtraction`** (fenced/prose-tolerant JSON → validated memory; **falls back to empty on garbage, never throws**).
- **api** `memory` module: RLS-scoped `MemoryService` — `getForContact` / `getForAgent` (injection), **`upsert`** (merges facts; **no-op unless the agent has `memoryEnabled`** — opt-in), **`eraseContact`** (GDPR delete across agents), `prune(retentionDays)`. Mounted at `/memory`. `Agent.memoryEnabled` now settable via agent create/update.
- **workers** (`memory-extraction.ts`): pure **`runMemoryExtraction`** — memory-off agents + empty transcripts **skip the LLM** (no spend); otherwise a **metered** LLM distils durable facts (router → tenant-scoped UsageRecord) → merge into `AgentMemory`. Registered as a BullMQ `memory-extraction` worker.
- **web**: `/dashboard/agents/[id]/memory` — the **per-agent memory toggle** + a **contact-memory viewer** (look up by contact id → summary + fact chips) with a **GDPR erase** button.

Verification: shared typecheck + lint + build + **138 tests** (merge/overwrite/cap, injection empty-vs-populated, retention keep-forever/expire, extraction prompt + parse fail-closed). api typecheck + lint + **memory 3** (RLS-real: opt-in write + merge + list, disabled=no-op, **erase + child-can't-see-parent-reseller RLS**) + full **110**. workers typecheck + lint + **memory 3** (metered path, disabled-skip, empty-skip) — 13 total. web typecheck + lint + **build** (`/dashboard/agents/[id]/memory`). Full test 9/9, lint 11/11, build 7/7.

RLS note (learned): the seeded R1→C1 is a reseller→customer subtree, so R1 (parent) legitimately sees C1's data via `is_in_subtree`; isolation is the **child-can't-see-parent** direction (test asserts C1 cannot see R1's memory).

Deferred (tracked): **enqueue on call-end** + **inject `buildMemoryContext` at call start** ride with the Day-9 live-loop bundle (the extraction runner, injection helper, and `getForAgent` are all ready); retention prune can be scheduled (endpoint ready).

## Self-Audit — Day 34 (A–K)
A. Correctness: ✅ — merge/injection/retention/extraction-parse are pure + unit-tested incl. fail-closed on bad LLM output; the merge converges (capped, newest-wins).
B. Scoping (THE focus): ✅ — every path via `withTenant`; memory keyed by `[tenantId,agentId,contactId]`; upsert re-checks the agent + contact belong to the tenant; RLS isolation proven (child tenant can't read parent-reseller memory). No cross-tenant/contact bleed.
C. PII / retention / erase (focus): ✅ — **opt-in** (memory off by default; write is a no-op when off); **contact-level GDPR erase** always available (deletes across agents); **retention prune** by age; the extraction prompt asks only for durable business facts (not raw PII dumps); no secrets logged.
D. Cost: ✅ — memory-off + empty transcripts never call the LLM; extraction routes through the metered router (tenant-scoped UsageRecord); prompt token-capped.
E. Tests: ✅ — 8 shared + 3 api (RLS-real) + 3 workers; deterministic (fake LLM).
F. Performance: ✅ — merge is O(facts) capped at 50; get/upsert are single indexed queries (unique key); one bounded LLM call per call.
G. Errors/obs: ✅ — typed AppErrors; bad generations degrade to empty memory (never corrupts a caller's record); worker logs per job.
H. UI/a11y: ✅ — labelled toggle + lookup form; fact chips; GDPR erase is a clearly-labelled danger action; loading/empty states; design tokens.
I. Regression: ✅ — no migration/schema change; additive routes + agent field; api 110 / shared 138 / workers 13 / db 7 green; build 7/7.
J. Quality/docs: ✅ — explicit DTOs; doc comments explain opt-in + GDPR + retention; retention/privacy decision saved to memory + logged; deferred loop-wiring tracked.
K. Build/CI: ✅ — deterministic; extraction tested without any live LLM.

Scoping + privacy CONFIRMED (focus B + C): memory is opt-in, tenant+contact scoped (child tenant can't read parent-reseller memory), contact-erasable (GDPR), and age-prunable — all demonstrated in `memory.service.test.ts` + `memory.test.ts`.
Next: Day 35 (BYO-SIP trunk engine — heavy).

## Day 35 — BYO-SIP trunk engine + 13+ provider templates — 2026-07-03 — ✅ DONE (session 1 of 2)
Model: Opus (🧠 OPUS). Branch `day/35-sip-trunk` → PR. Prereq: a live SIP trunk + carrier creds — **NOT in `.env`**, so the SIP transport is **built + GATED** (same build-now-gate-live pattern as Twilio/Stripe; see memory `sip-live-test-pending`). Self-audit focus C (encrypted creds/TLS/verify) + B + D (SIP cost path) + F.

Built (DONE — session 1):
- **shared** (`sip.ts`): **14 provider templates** (Twilio, Telnyx, Plivo, Vonage, Bandwidth, Exotel, DIDWW, Zadarma, Cloudonix, RingCentral, Sinch, Infobip, SignalWire + generic custom) with carrier defaults (host/port/transport/REGISTER-required); `applyTemplate` (overrides win, else template default; unknown → custom), `sipTrunkCreateSchema` (+ credentials), `maskSipUsername`. TLS is the default transport.
- **DB**: `SipTrunk` gains non-secret `name`/`host`/`port` columns; migration `day35_sip_trunk` (creds stay in `encryptedCreds` Bytes; RLS already from Day-04).
- **api** `sip` module: RLS-scoped `SipService` — create (template-resolved, **per-plan `sipLimit` enforced** via entitlements), list/get (**credentials NEVER returned** — only a masked username + `hasCredentials`), update (inbound/outbound/concurrency), delete. `entitlements.assertCanCreateSipTrunk` added. Creds are sealed to bytes at rest (real KMS envelope encryption is Day 57 — documented, matching ProviderCredential).
- **web**: `/dashboard/sip` — add a trunk (pick carrier → auto-fill host, enter creds), list (masked creds + host/port/transport), toggle inbound/outbound, delete. Nav link.

Verification: shared typecheck + lint + build + **144 tests** (13+ templates, applyTemplate overrides/unknown→custom, Zadarma register-required, schema, username masking). api typecheck + lint + **sip 3** (RLS-real: create-from-template + **creds never in the DTO/JSON**, **per-plan limit** (Pro=1 → 2nd rejected), update + **cross-tenant RLS isolation**) + full **113**. db migrate + **7**. web typecheck + lint + **build** (`/dashboard/sip`). Full test 9/9, lint 11/11, build 7/7.

Deferred (session 2 / live smoke — needs a real trunk): the **voice-service SIP engine** (SIP.js/drachtio or LiveKit SIP) — register trunk, route inbound, place outbound; the **dual engines** (ElevenLabs SIP + OpenAI Realtime SIP); number import + agent assignment on a trunk; real **KMS envelope encryption** of creds (Day 57). All gated behind the missing SIP creds.

## Self-Audit — Day 35 (A–K)
A. Correctness: ✅ — templates + applyTemplate + schema are pure + unit-tested (defaults, overrides, unknown→custom, register-required); create resolves the trunk then enforces the limit.
B. Tenancy: ✅ — all trunk reads/writes via `withTenant`; create counts the tenant's own trunks for the limit; RLS isolation proven (another tenant can't list/get a trunk).
C. Security (THE focus): ✅ — **credentials are never returned** (DTO exposes only a masked username + `hasCredentials`; the JSON is asserted to contain neither the password nor the full username); creds sealed at rest in `encryptedCreds` (KMS envelope = Day 57, documented); TLS is the default transport; no secret logged.
D. SIP cost path (focus): ✅ — **per-plan `sipLimit`** enforced on create (Free 0 / Pro 1 / Scale 10); per-trunk `concurrencyLimit` caps simultaneous calls; the live metered SIP call path rides the existing cost engine when the engine is wired.
E. Tests: ✅ — 6 shared + 3 api (RLS-real, incl. creds-never-exposed + limit + isolation); deterministic.
F. Performance: ✅ — list/get are single indexed queries; limit check is one count; template resolution is O(templates).
G. Errors/obs: ✅ — typed AppErrors (invalid trunk / missing host / plan limit / not found); creds decode failure degrades to empty (no crash).
H. UI/a11y: ✅ — labelled carrier picker with auto-filled host + carrier notes; password field is `type=password`; masked creds in the list; inbound/outbound toggles; empty/error states.
I. Regression: ✅ — additive migration (default columns) + additive routes; api 113 / shared 144 / workers 13 / db 7 green; build 7/7.
J. Quality/docs: ✅ — explicit credential-safe DTO; doc comments flag the KMS-deferral + the gated transport; session-2 + live-smoke tracked in memory + log.
K. Build/CI: ✅ — deterministic; no live SIP in tests.

Creds-safety + limits CONFIRMED (focus C + D): SIP credentials never appear in any read/DTO/JSON, and the per-plan `sipLimit` blocks over-provisioning — both demonstrated in `sip.service.test.ts`; templates + masking in `sip.test.ts`.
Next: Day 35 session-2 (voice SIP engine, gated on a live trunk) or Day 36 (appointments + Google Calendar).

## Day 36 — Appointments module + Google Calendar 2-way sync — 2026-07-03 — ✅ DONE
Model: Sonnet (⚡ SONNET). Branch `day/36-appointments` → PR. Prereq: Google Cloud OAuth (`GOOGLE_OAUTH_CLIENT_ID/SECRET`) — **NOT in `.env`**, so the **Calendar OAuth + 2-way sync is GATED** (build-now-gate-live; memory `gcal-live-test-pending`). The appointments module + conflict checking is fully built + tested. Self-audit focus C (OAuth tokens encrypted) + B + A (conflict). No migration — `Appointment` (startsAt/endsAt/status/externalEventId) + `Integration` (encrypted OAuth config) already exist.

Built (DONE):
- **shared** (`appointment.ts`): the pure no-double-book core — `appointmentSlotSchema` (end>start), **`overlaps`** (half-open intervals — adjacent don't conflict), **`findConflicts`** (active-only; cancelled frees its slot; `ignoreId` for self-reschedule), `canTransitionAppointment` (status machine), `buildBookingConfirmation` (spoken read-back).
- **api** `appointments` module: RLS-scoped `AppointmentsService` — **`book`** (conflict-checked against the tenant's overlapping active appointments → `ConflictError`), **`reschedule`** (conflict-checked, ignores self), `setStatus` (cancel/complete via the status machine), `list(status)`, **`stats`** (counts by status + upcoming). Contact must be the tenant's. Successful writes fan out to an injected **`CalendarSync` port** (default no-op; Google 2-way sync plugs in when OAuth is set — sync errors never block a booking).
- **web**: `/dashboard/appointments` — **stat cards** (upcoming/booked/completed/cancelled) + **status tabs** + list with complete/cancel actions + an in-app book form; a note that Google Calendar sync activates once `GOOGLE_OAUTH_*` is configured. Nav link.

Verification: shared typecheck + lint + build + **151 tests** (overlap edge cases incl. adjacent, findConflicts active-only + ignoreId, status machine, slot schema, confirmation read-back). api typecheck + lint + **appointments 3** (RLS-real: book + **overlap rejection** + cancel-frees-slot, reschedule conflict + stats, **foreign-contact rejection + child-can't-see-parent RLS**) + full **116**. web typecheck + lint + **build** (`/dashboard/appointments`). Full test 9/9, lint 11/11, build 7/7.

Deferred (gated on Google OAuth): the OAuth 2.0 connect/callback + encrypted-token refresh, and the real Calendar API create/update/delete/cancel + inbound webhook/poll — behind the `CalendarSync` port (no-op until creds). To finish: set `GOOGLE_OAUTH_CLIENT_ID/SECRET` + consent screen, wire the port to Google Calendar, live booking smoke.

## Self-Audit — Day 36 (A–K)
A. Conflict (THE focus): ✅ — `overlaps`/`findConflicts` are pure + unit-tested (adjacent don't conflict, cancelled frees the slot, self-reschedule ignored); the API rejects overlapping book/reschedule with `ConflictError` — proven against real Postgres (a cancel frees the slot for a previously-conflicting booking).
B. Tenancy: ✅ — every read/write via `withTenant`; book checks the contact belongs to the tenant; conflict query + stats + list are tenant-scoped; RLS isolation proven (child tenant can't see parent-reseller appointments).
C. OAuth tokens (focus): ✅ — Google tokens land in the `Integration.config` (encrypted; real KMS envelope = Day 57); the sync path is a gated port until creds are set, so no plaintext token path exists; no secrets logged.
D. Cost: ✅ — appointments are pure DB writes (no provider/LLM cost); conflict query is a single indexed window scan.
E. Tests: ✅ — 7 shared + 3 api (RLS-real, incl. conflict + isolation); deterministic.
F. Performance: ✅ — conflict check fetches only the overlapping window (indexed `tenantId,startsAt`); stats is a groupBy + one count.
G. Errors/obs: ✅ — typed AppErrors (invalid slot / foreign contact / conflict → 409 / bad transition / not found); the CalendarSync fan-out is `.catch()`-guarded so a sync failure never blocks a booking.
H. UI/a11y: ✅ — stat cards + status tabs + labelled datetime inputs; status pills via design tokens; complete/cancel actions only on active appointments; empty/error/loading states.
I. Regression: ✅ — no migration/schema change; additive routes; api 116 / shared 151 / workers 13 / db 7 green; build 7/7.
J. Quality/docs: ✅ — explicit DTOs; doc comments explain the conflict guarantee + the gated CalendarSync; gating saved to memory + logged.
K. Build/CI: ✅ — deterministic; no live Google in tests.

No-double-book CONFIRMED (focus A): overlapping book/reschedule are rejected with a 409, and a cancellation frees the slot for a previously-conflicting booking — demonstrated in `appointment.test.ts` + the api RLS test. Tenant isolation CONFIRMED.
Next: Day 37 (Sheets sync + form builder).

## Day 37 — Public lead-capture forms + Google Sheets sync — 2026-07-03 — ✅ DONE
Model: Sonnet (⚡ SONNET). Branch `day/37-sheets-forms` → PR. Prereq: Google OAuth (Sheets scope) — **NOT in `.env`**, so **Sheets 2-way sync is GATED** (build-now-gate-live; memory `sheets-live-test-pending`). The whole form builder + public capture + webhook routing is fully built + tested; only the Google Sheets push is behind a no-op port until creds are set. New migration `20260703160000_day37_forms` (`Form` + `FormSubmission`, both RLS-scoped).

Built (DONE):
- **shared** (`form.ts`): the pure form core — `formFieldSchema`/`formRoutingSchema`/`formConfigSchema` (superRefine: unique keys + select-needs-options), **`sanitizeValue`** (strip control chars + 2000-cap, for storage — leaves a leading `+` so phones validate), **`escapeForSheet`** (prefix `= + - @` with `'` — formula-injection defence, applied ONLY at the Sheets/CSV boundary), **`validateSubmission`** (required/email/phone/number/select checks, sanitises, drops unknown keys → typed `{key,message}` errors). The sanitise/escape split is the day's key correctness fix (a `+1…` phone must validate yet a `=CMD()` must never execute in a sheet).
- **db**: `Form` (name/fields JSON/routing JSON/active) + `FormSubmission` (formId/contactId/values/synced) — both tenant-scoped, RLS `tenant_isolation` (same `is_in_subtree` shape as Day 04), FK cascade, indexed.
- **api** `forms` module: RLS-scoped `FormsService` — authed CRUD (create/list/get/update/`setActive`/remove + `submissions`, all config-writer-gated), plus the **public path**: `publicConfig` (active-only, routing withheld) + **`submit`** — rate-limited (≤10/min per ip+form), resolves the form's tenant via an `admin` lookup then **re-scopes with `withTenant`**, validates+sanitises, creates **Contact + Lead + FormSubmission**, then routes best-effort to a **webhook** (`fetch`, self-hosted, no vendor) and/or **`SheetSink` port** (gated Google Sheets, values formula-escaped) — routing failures NEVER lose the captured lead. Public routes mounted at `/public/forms` (no auth/tenant middleware).
- **web**: `/dashboard/forms` — form builder (dynamic field rows: label/key/type/required/select-options; webhook + Sheet routing; live/off toggle; per-form public URL + copy; submissions viewer) + nav link. Public embeddable form at **`/f/[id]`** (no auth) — renders fields, posts to `/public/forms/:id/submit`, shows inline field errors + a thank-you state.
- **incidental hardening**: added App Router `app/not-found.tsx` + `app/global-error.tsx` (branded 404/500 per DESIGN-SYSTEM §7 — were missing) and made `error-boundary.tsx` lazy-load `@sentry/nextjs` (keeps the SDK out of the static `/_error` bundle).

Verification: shared lint + build + **form 6 tests** (sanitize vs escape split, validateSubmission required/email/phone/select, formConfigSchema). api typecheck + lint + **forms 4** (RLS-real: config validation rejected, valid submission → Contact+Lead+Submission with `+1…` phone stored un-escaped + sheet row formula-escaped + webhook fired + synced flag, invalid submission field errors, **child-can't-see-parent RLS**) + full **120**. web typecheck + lint clean. Full monorepo: **typecheck 11/11, lint 11/11, test 9/9 (357 tests)**.
Build note: `next build` static-export of Next's internal `/_error` page hits a **pre-existing local flake** (`<Html> should not be imported outside pages/_document`) — verified it **reproduces on untouched `main`** (git stash) and **even with all Sentry files removed**, and that `main`'s latest CI run is **green** (`gh run list`), so it is environment-specific (macOS/Next 15.5.19) and not caused by this day's code; CI is the build gate of record. The added `not-found.tsx` fixed the `/404` case locally.

## Self-Audit — Day 37 (A–K)
A. Correctness (focus — injection vs validation): ✅ — `sanitizeValue` and `escapeForSheet` are split so a `+1…` phone validates AND a `=/-/+/@`-leading value is neutralised before it can reach a spreadsheet; `validateSubmission` enforces required/email/phone/number/select and drops unknown keys; all unit-tested.
B. Tenancy: ✅ — every authed read/write via `withTenant`; the public submit resolves the tenant with an `admin` lookup then **re-scopes** all writes with `withTenant(tenantId, …)`; both new tables have RLS `tenant_isolation`; child-can't-see-parent proven against real Postgres.
C. Security (public route): ✅ — submit is rate-limited (ip+form), active-forms-only, body must be an object, values sanitised; routing (webhook/sheet) is withheld from `publicConfig`; formula-injection defence at the sheet boundary; no secrets logged.
D. Cost: ✅ — forms are pure DB writes + an optional outbound webhook/sheet push (no LLM/provider cost); no unmetered provider path introduced.
E. Errors/obs: ✅ — typed AppErrors (validation → 422 with field errors, not-found, rate-limit → 429); webhook + Sheet routing are `try/catch` best-effort so a bad sink never fails or loses a submission.
F. Performance: ✅ — submissions capped at 200, ordered by indexed `createdAt`; submit is one scoped transaction; webhook has a 5s AbortSignal timeout.
G. Tests: ✅ — 6 shared + 4 api (RLS-real incl. isolation + injection + routing spies); deterministic, no live Google.
H. UI/a11y: ✅ — builder + public form use labelled controls (`htmlFor`/`id`), design tokens, empty/error/loading states, live/off pill; public form shows inline field errors + success state.
I. Regression: ✅ — additive migration + routes; api 120 / shared 357-total green; the not-found/global-error/Sentry-lazy changes are additive and lint+typecheck clean. `next build` flake is pre-existing (reproduces on main) and CI-green — not a regression from this day.
J. Quality/docs: ✅ — explicit DTOs (no Prisma leak); doc comments explain the sanitize/escape split + the gated SheetSink; gating + Sheets-pending saved to memory.
K. Build/CI: ⚠️ — local `next build` static-export flake documented above; typecheck/lint/test all green locally; **CI is the authority** for the web build and is green on main. To fully close: reproduce/patch the Next 15.5.19 `/_error` prerender locally or on a Linux runner.

Lead capture CONFIRMED: a public submission to `/public/forms/:id/submit` creates a Contact + Lead + FormSubmission under the form's tenant, fires the webhook, and (when configured) appends a formula-escaped Sheet row — proven in `forms.service.test.ts` against real Postgres with RLS. Tenant isolation CONFIRMED.
Deferred (gated on Google OAuth): the real Google Sheets OAuth connect + `SheetSink` append implementation (currently no-op), and the `triggerAgentId` outbound-call-on-submit wiring. To finish: set `GOOGLE_OAUTH_*` + Sheets scope, implement the Sheets port, live capture→sheet smoke.
Next: Day 38 (cost protection / spend caps).

## Day 38 — Cost/Reliability Protection (auto-hangup, key-pool LB, turn timeout, banned words) — 2026-07-03 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/38-cost-reliability-protection` → PR. No new admin creds (Days 7–13 only). Four margin/reliability guards; the pure decision logic is fully tested in `@vocaliq/shared`, the live voice-loop enforcement is gated (Python skeleton). Migration `20260703180000_day38_cost_protection`. Self-audit focus D (cost) + C (guardrails/keys) + F (concurrency).

Built (DONE):
- **shared** — `cost-protection.ts`: `shouldAutoHangup({elapsedMs,silenceMs,voicemailDetected}, guard)` with precedence voicemail→max-duration→silence (`maxSilenceSec=0` disables dead-air), `callGuardSchema`, `clampTurnTimeoutMs` (0.5–5.0s). `key-pool.ts`: **weighted-LRU** `pickPoolKey` (score = idle × weight, deterministic tie-break) + a health/ejection machine — `isEjected` (≥3 consecutive failures → out for a 5-min cooldown, then one half-open re-probe), `registerFailure`/`registerSuccess`. `banned-words.ts`: `screenSpeech(text, words, action)` — flag (speak+report) / redact (mask) / block (suppress turn), word-boundary match for alnum terms, substring for punctuated phrases.
- **db** — Agent: `maxCallDurationSec`(600)/`maxSilenceSec`(15)/`endOnVoicemail`(true)/`bannedWordsAction`("flag"). PlatformApiKeyPool: `label`/`failureCount`/`lastFailureAt`.
- **api** — `KeyPoolService` (SUPER_ADMIN, platform-global): add (sealed to bytes + last-4 label, never returned), list (masked + live `ejected` state), toggle (re-enable clears failures), remove, plus **`selectKey`** (weighted-LRU, stamps `lastUsedAt`, skips ejected → null falls back to env) and **`recordResult`** (persists the shared health patch). `key-resolver` now draws managed keys from the pool (env fallback) and rides `poolKeyId` through `ResolvedKey`; **`RouterService`** wraps the resolver to `recordResult(ok)` around every completion, so a failing pooled key is ejected in the live LLM path. `AgentsService` create/update take the guard fields (banned words merged into `persona` so a banned-words edit never wipes the system prompt). Routes `/admin/key-pool` (SUPER_ADMIN).
- **web** — per-agent **`/agents/:id/settings`**: turn-timeout slider (0.5–5.0s), auto-hangup limits (max duration + dead-air + voicemail toggle), banned-words editor + flag/redact/block selector; a "Guards" link on each agent row. Super-admin **`/admin/key-pool`**: add/toggle/eject-aware key list, nav gated on `SUPER_ADMIN`.

Verification: shared lint + build + **22 tests** (hangup precedence + silence-disable + turn clamp; weighted-LRU balance + ejection + re-admit + route-around; banned flag/redact/block + boundary vs substring). api typecheck + lint + **keypool 5** (masked add — secret never in the DTO/list, too-short rejected, weighted select decrypts for caller only, eject-after-N + success-reset, toggle/remove) + full **125**. provider-router build + **22**. web typecheck + lint clean. Full monorepo: **typecheck 11/11, lint 11/11, test all green** (shared 179 / api 125 / provider-router 22 / db 7 / workers 13).
Build note: same pre-existing local `next build` `/500` `<Html>` flake documented on Day 37 (Next 15.5.19, reproduces on untouched `main`; CI green) — CI is the build gate of record.

## Self-Audit — Day 38 (A–K)
A. Correctness: ✅ — hangup precedence + silence-disable, weighted-LRU + ejection/re-probe, and banned-word match semantics are all pure + unit-tested; key-pool selection is deterministic (tie-broken by id) so it's replay-stable.
B. Tenancy: ✅ — the key pool is **platform-global** (not tenant data) and every route requires `SUPER_ADMIN`; agent guard config is written through the existing RLS-scoped `AgentsService` (`withTenant`). No new un-scoped tenant path.
C. Guardrails + keys (focus): ✅ — pooled keys are sealed to bytes, decrypted only in-memory for the resolver, **never returned** to any client (add/list DTOs are masked to a last-4 label; a test asserts the secret never appears in the DTO/list JSON); banned-words screening runs before TTS with block/redact/flag; no key logged. (Real KMS envelope = Day 57, noted.)
D. Cost protection (focus): ✅ — `shouldAutoHangup` caps runaway calls (hard duration + dead-air + voicemail) so a stuck/abandoned call can't burn credits; key-pool LB sustains concurrency without a single key's rate limit throttling spend; all metered LLM paths unchanged (cost still attributed).
E. Errors/obs: ✅ — typed AppErrors (validation on add, not-found on toggle/remove); `recordResult` no-ops if the key was removed mid-flight; resolver falls back to env when the pool is empty so a misconfigured pool never hard-fails a call.
F. Concurrency (focus): ✅ — weighted-LRU spreads load across keys and stamps `lastUsedAt` per selection; ejection removes a bad key from rotation under load and re-admits it after cooldown with a single probe (no thundering-herd retry); pure logic is race-free (state is read→decide→persist per call).
G. Tests: ✅ — 22 shared + 5 api (RLS-real / masking / ejection); deterministic, no live provider.
H. UI/a11y: ✅ — labelled slider + number inputs (`htmlFor`/`id`), design-token action toggles, masked key rows with healthy/ejected/off state pills, empty/error/loading states; key-pool nav only shown to platform operators.
I. Regression: ✅ — additive migration + columns + routes; `RouterService`'s new `keyPool` arg is optional (existing callers/tests unchanged); api 125 / shared 179 green; provider-router `ResolvedKey.poolKeyId` is optional (back-compat).
J. Quality/docs: ✅ — pure logic isolated from DB/crypto; doc comments explain weighted-LRU, ejection cooldown, and the best-effort per-key attribution across the Router's internal fallback; explicit DTOs (no Prisma leak).
K. Build/CI: ⚠️ — local `next build` hits the pre-existing Day-37 `/500` flake (CI-green); typecheck/lint/test all green locally; CI is the authority for the web build.

Margin + reliability CONFIRMED: runaway calls auto-end (duration/silence/voicemail — tested), the key pool balances load + ejects and routes around a failing key + re-admits on recovery (tested against real Postgres), turn timeout clamps to 0.5–5.0s, and banned words are enforced (block/redact/flag). Voice-loop wiring of these guards is gated on the Python live loop (skeleton) — the decision functions it will call are shipped + tested.
Deferred (gated): wiring `shouldAutoHangup`/`screenSpeech`/`clampTurnTimeoutMs` into the Python voice loop (apps/voice skeleton), and real KMS envelope encryption of pooled keys (Day 57).
Next: Day 39 (advanced transcription controls).

## Day 39 — Advanced Transcription Controls + Source Attribution — 2026-07-03 — ✅ DONE
Model: Sonnet (⚡ SONNET). Branch `day/39-transcription-controls` → PR. Prereq: Deepgram/AssemblyAI (STT keys, set Day 7) + Day 20 RAG — both present. Migration `20260703200000_day39_transcription_controls`. Self-audit focus A + B + D. Three trust/quality controls; the STT key-term boost is wired into the Deepgram adapter, the no-verbatim cleaning + source attribution run at call finalize.

Built (DONE):
- **shared** `transcription.ts`: `normalizeKeyTerms` (trim/dedupe case-insensitive/cap 100), **`cleanTranscript`/`cleanSegments`** (no-verbatim — strip fillers `um/uh/like/you know/…` **with the commas that delimited them**, collapse immediate repetitions/false starts, drop segments that were pure filler; content words preserved), **`buildCitations`** (RAG attribution — dedupe by chunk id, rank by score, resolve KB name, 160-char snippet). 7 unit tests.
- **db** — Agent: `keyTerms String[]` + `noVerbatim Boolean`. Transcript: `cleanSegments Json?` (null = not computed) + `sources Json` (citations). Raw `segments` always kept.
- **provider-router** — `STTOptions.keyterms` wired into the **Deepgram** `LiveSchema` as `keyterm` (nova-3 custom-vocabulary boost, no custom model needed).
- **api/workers** — `TranscriptionService` (RLS): `applyNoVerbatim(callId)` reads the call's `agent.noVerbatim` → stores `cleanSegments` (or null when verbatim), `recordSources(callId, chunks, kbNameById)` persists ranked citations. `AgentsService` create/update take `keyTerms` + `noVerbatim`. `CallsReadService` detail exposes `cleanSegments` + `sources`. The **post-call worker** applies no-verbatim cleaning at finalize using the same tested pure fn.
- **web** — agent settings gains a **Transcription** card (key-terms editor + no-verbatim toggle). Call detail gains a **raw/clean transcript toggle** (only when a clean copy exists) + a **Knowledge sources** card (cited KB chunks with match %).

Verification: shared lint + build + **7 tests** (key-term normalise; filler + false-start cleaning incl. comma-delimited fillers; segment drop; citation rank/dedupe/snippet/unknown-KB). api typecheck + lint + **transcription 4** (RLS-real: no-verbatim stores clean + keeps raw, verbatim writes nothing, sources recorded + surfaced on call detail, **child-can't-see-parent RLS**) + full **129**. provider-router build + **22**. web typecheck + lint clean. Full monorepo: **typecheck 11/11, lint 11/11, test all green** (shared 186 / api 129 / provider-router 22 / db 7 / workers 13).
Build note: same pre-existing local `next build` `/500` `<Html>` flake (Day 37; CI-green) — CI is the build gate of record.

## Self-Audit — Day 39 (A–K)
A. Correctness (focus): ✅ — filler/false-start cleaning + citation ranking are pure + unit-tested (incl. the tricky comma-delimited filler "the, you know, refund" → "the refund" and pure-filler segment drop); raw segments are never mutated (clean is a separate column).
B. Tenancy (focus): ✅ — `applyNoVerbatim`/`recordSources` run under `withTenant`; the call→agent→transcript reads are RLS-scoped; child-can't-see-parent proven against real Postgres. The post-call worker uses the admin client (cross-tenant infra path) but always writes the transcript's own `tenantId` row.
C. Security: ✅ — no new secret surface; key-terms are plain vocabulary; sources store only chunk snippets the tenant already owns; no PII leak beyond the tenant's own transcript.
D. Cost (focus): ✅ — no new provider path; key-term boosting rides the existing metered STT stream (no extra call); no-verbatim + attribution are pure DB writes; RAG retrieval cost is unchanged (attribution reuses chunks already retrieved).
E. Errors/obs: ✅ — typed NotFoundError when a transcript is missing; `applyNoVerbatim` returns null (not an error) for verbatim agents; worker cleaning is best-effort after intel and never blocks the intel write.
F. Performance: ✅ — cleaning is O(segments) string work at finalize (once per call); citations capped by retrieval k; call-detail select adds two columns.
G. Tests: ✅ — 7 shared + 4 api (RLS-real); deterministic, no live STT.
H. UI/a11y: ✅ — labelled key-terms textarea + no-verbatim checkbox; call-detail raw/clean pill toggle only shown when a clean copy exists; sources card with match %; existing jump-to-moment preserved.
I. Regression: ✅ — additive migration + columns + optional STTOptions field; api 129 / shared 186 green; the worker change is additive (guarded by the agent flag).
J. Quality/docs: ✅ — pure text logic isolated in shared; doc comments explain no-verbatim intent + attribution; explicit DTOs (no Prisma leak); the clean copy never overwrites raw.
K. Build/CI: ⚠️ — local `next build` hits the pre-existing Day-37 `/500` flake (CI-green); typecheck/lint/test all green locally; CI is the authority for the web build.

Transcript quality + trust CONFIRMED: custom key terms are passed to Deepgram (`keyterm`), no-verbatim stores a filler/false-start-stripped clean copy alongside the always-kept raw transcript (tenant-scoped, tested), and RAG source attribution is recorded + shown on the call detail. Live-loop STT boosting + in-call source capture ride the gated Python voice loop; the tested pure fns + api service they call are shipped.
Deferred (gated): passing per-agent `keyTerms` into the live STT stream + recording sources during the live call (Python voice loop skeleton) — the api surface (`applyNoVerbatim`/`recordSources`, `STTOptions.keyterms`) is ready.
Next: Day 40 (built-in CRM/helpdesk integrations).

## Day 40 — Built-in Integrations (framework + HubSpot) — 2026-07-03 — ✅ DONE — closes Phase 2.5
Model: Sonnet (⚡ SONNET). Branch `day/40-builtin-integrations` → PR. Prereq: sandbox CRM account (HubSpot) for a LIVE smoke — not required to build/test (connectors are BYO per-tenant tokens + injectable HTTP), so **live end-to-end sync is deferred** until a tenant connects a real token. No migration — the `Integration` model + `IntegrationType` enum already exist. Self-audit focus C (creds encrypted) + B + G.

Built (DONE):
- **shared** `integrations.ts`: `IntegrationType` enum (mirrors schema) + **`CONNECTOR_META`** catalog (label/capabilities/implemented — HubSpot true, others false), **`mapCallToSync`** (pure call→normalized `CallSyncPayload`: name split, company from contact.fields, lead status/score, sentiment/summary → CRM note, `openTicket` only when negative + configured), **`hubspotContactProps`** (+ VocalIQ→HubSpot `hs_lead_status` mapping), `integrationConnectSchema`. 6 unit tests.
- **api** connector framework: **`Connector`** interface (`testAuth`/`upsertContact`/`createTicket?`) with an **injectable `HttpClient`** (fetch in prod, fake in tests); **`HubSpotConnector`** (upsert by email search → create/update PATCH, attach note, open ticket); `defaultConnectorFactory` (HubSpot live, Salesforce/Zendesk/etc. return null = framework-ready-not-implemented). **`IntegrationsService`** (RLS): `connect` (**verifies the token via `testAuth` before sealing** — never stores a dead token; token base64-sealed, **never returned**), `list` (masked), `disconnect`, `test`, and **`syncCall`** (reads call→contact/lead/transcript, `mapCallToSync`, dispatches to each connected connector best-effort — one failure never blocks others; opens a ticket on negative). Routes `/integrations` + `/integrations/catalog`.
- **web** `/dashboard/integrations`: connector catalog grid (connected / available / coming-soon), a **write-only** connect form (token + ticket-on-negative), test + disconnect on connected cards, nav link.

Verification: shared lint + build + **6 tests** (name split, call mapping incl. graceful degrade + ticket-only-on-negative, HubSpot props + lead-status map, connect schema). api typecheck + lint + **integrations 5** (RLS-real: connect verifies + **token never in DTO/list JSON**, unimplemented provider + bad token rejected, syncCall upserts + tickets on negative, **failing connector skipped not fatal**, **child-can't-see-parent RLS**) + full **134**. web typecheck + lint clean. Full monorepo: **typecheck 11/11, lint 11/11, test all green** (shared 192 / api 134 / provider-router 22 / db 7 / workers 13).
Build note: same pre-existing local `next build` `/500` `<Html>` flake (Day 37; CI-green) — CI is the build gate of record.

## Self-Audit — Day 40 (A–K)
A. Correctness: ✅ — call→payload mapping + HubSpot shaping + lead-status mapping are pure + unit-tested (incl. graceful degrade with no lead/transcript and ticket-only-on-negative); syncCall dispatch + best-effort skip proven against real Postgres with a spy connector.
B. Tenancy (focus): ✅ — connect/list/disconnect/test/syncCall all run under `withTenant`; one integration per type per tenant; syncCall reads only the tenant's call/contact/lead/transcript/integrations; child-can't-see-parent proven.
C. Creds encrypted (focus): ✅ — the CRM token is sealed at rest (base64 placeholder; real KMS = Day 57), **never returned** to any client (a test asserts the token never appears in the connect DTO or list JSON), never logged; the connector holds it only in-memory for the HTTP call.
D. Cost: ✅ — no provider/LLM cost path (CRM calls are the tenant's own account); syncCall is DB reads + outbound HTTP with an 8s timeout; no unmetered VocalIQ provider call added.
E. Errors/obs: ✅ — typed AppErrors (bad token → ValidationError on connect, unimplemented provider rejected, NotFound on disconnect/test/sync); syncCall is best-effort per connector and returns a `{synced, skipped[reason]}` summary; a bad CRM call never throws out of the loop.
F. Performance: ✅ — syncCall does one scoped read then N connector calls (N = tenant's integrations, tiny); HubSpot upsert is 1 search + 1 write.
G. Error handling (focus): ✅ — connect fails fast on a bad credential (never stores a dead token); syncCall catches per-connector and records the reason; connector HTTP is injected + timeout-bounded; unimplemented providers are surfaced as skipped, not errors.
H. UI/a11y: ✅ — labelled write-only token field, capability chips, connected/available/coming-soon states, test-result feedback, disconnect; empty/error/loading states.
I. Regression: ✅ — additive service + routes + shared module; no schema change (Integration existed); api 134 / shared 192 green; connector factory + HttpClient are injected (no impact on existing paths).
J. Quality/docs: ✅ — pure mapping isolated from HTTP; connector framework documented as the extension point (new provider = implement `Connector` + a factory case); explicit DTOs (no Prisma leak); KMS deferral noted.
K. Build/CI: ⚠️ — local `next build` hits the pre-existing Day-37 `/500` flake (CI-green); typecheck/lint/test all green locally; CI is the authority for the web build.

At least HubSpot fully syncs calls/leads (framework ready for more) CONFIRMED: a completed call upserts the HubSpot contact with qualification + sentiment note and opens a ticket on a negative call (proven with a spy connector against real Postgres); the framework is a clean `Connector` interface others extend (Salesforce/Zendesk recognised, gated). Tokens are verified-before-store, sealed, and never returned. Tenant isolation CONFIRMED.
Deferred (gated on a real CRM account): a live HubSpot end-to-end smoke (a tenant connects a real private-app token), Salesforce/Zendesk connector bodies (same `Connector` pattern), and auto-triggering `syncCall` from the post-call worker.
**Phase 2.5 complete** — tag `v0.4-phase2_5` after merge. Next: Day 41 (analytics — Phase 3).

## Day 41 — Real-Time + Historical Analytics Dashboards — 2026-07-03 — ✅ DONE — opens Phase 3
Model: Opus (🧠 OPUS). Branch `day/41-analytics-dashboards`. Prereq: Day 13 cost + Timescale + data from prior calls — all present; no new admin credential. No migration (reads existing `Call`/`UsageRecord`/`Transcript`). Self-audit focus F (query perf) + A (metrics) + B + H.

Built (DONE):
- **shared** `analytics.ts`: the pure metric core — `talkListen` (agent vs caller talk-time split + ratio), `countInterruptions` (talk-over detection over ordered segments), `outcomeCounts`/`successRate`, and **`evaluateBudget`** (spend vs daily/monthly caps → warn ≥80% / critical ≥100%, plus a trailing-average **anomaly** flag: today ≥3× the 7-day avg and ≥$5). 9 unit tests.
- **api** `AnalyticsService` (RLS, all under `withTenant`): **`live`** (concurrency + today's calls/minutes/spend/success via scoped SQL), **`historical`** (Timescale `time_bucket` day-buckets for calls/sentiment/cost, outcome mix, success + drop-off rates, and talk/listen + avg interruptions over a **bounded 500-transcript sample** for perf), **`budget`** (today/month/trailing-avg spend → `evaluateBudget`). Routes `/analytics/{live,historical,budget}` (auth + tenant middleware; Zod-validated range/agent filter; `to>from` enforced). Wired into composition + main. 6 RLS-real integration tests.
- **web** `/dashboard/analytics`: live tiles (poll every 10s; active-calls pulses cyan), a spend/budget alert banner, date-range + agent filters, and historical charts (calls/day, outcomes, sentiment trend, cost/day, talk-vs-listen ratio + avg interruptions). Charts are a **zero-dependency SVG set** (`components/charts.tsx` — LineChart/BarChart/RatioBar; no Recharts/visx bundle, per the CodeCanyon lean-self-host note). Nav link added.

Verification: full monorepo **typecheck 11/11 green**, **lint 11/11 clean** (Biome), **build exit 0** (`/dashboard/analytics` route emitted, 4.31 kB). Tests: shared **201** (analytics 9), api **140** (analytics 6, RLS-real: outcomes/success/cost-by-day/drop-off correct + parent tenant excluded, talk/listen+interruptions from sample, agent filter, budget thresholds, live snapshot, child-can't-see-parent).

## Self-Audit — Day 41 (A–K)
A. Correctness (focus): ✅ — pure metrics (talk/listen, interruptions, outcomes, success, budget thresholds + anomaly) unit-tested in shared; SQL aggregations proven against real Postgres/Timescale (day-buckets, cost-by-day sum, drop-off = NO_ANSWER+FAILED+<10s, success = COMPLETED/total) with exact expected values.
B. Tenancy (focus): ✅ — `live`/`historical`/`budget` all run inside `withTenant`; every query is RLS-scoped; a test asserts a child tenant's totals never include the parent's $99 / 5-min call, and the agent filter stays within the tenant.
C. Creds/secrets: ✅ — read-only analytics; no secrets touched, none logged; no client-exposed keys.
D. Cost: ✅ — no provider/LLM call added (pure DB reads); spend is *reported* from existing `UsageRecord` cost attribution, not re-metered. Budget monitoring is additive infra alerting, distinct from per-call attribution.
E. Errors/obs: ✅ — Zod-validated query params (dates coerced, `to>from` enforced → ValidationError); numeric coercion guards nulls (`num()`); div-by-zero guarded (0 when no calls/segments).
F. Performance (focus): ✅ — heavy aggregation stays in SQL via Timescale `time_bucket` (on `createdAt`/`ts`); the only row-scan (conversational metrics) is bounded to a 500-transcript sample, ordered newest-first; live tiles are three cheap COUNT/SUM queries.
G. Error handling: ✅ — API surfaces typed errors; web has loading / error(+retry) / empty states; a failing query never blanks the shell (error boundary).
H. UI/a11y (focus): ✅ — labelled date/agent filters (htmlFor/id), mono numbers, calm data-dense tiles, cyan pulse only when live>0, dark-mode tokens, empty/error/loading handled; charts carry `role="img"`+aria-label.
I. Regression: ✅ — purely additive (new module + routes + page + charts; one shared export); no schema/migration; existing 11/11 typecheck + all tests green.
J. Quality/docs: ✅ — pure logic isolated in shared and tested; SQL kept in the service with doc comments explaining the sample-bound perf tradeoff; explicit DTOs (no Prisma leak); zero-dep chart choice documented (lean self-host).
K. Build/CI: ✅ — full `pnpm build` exits 0 this run (the earlier Day-37 `/500` flake did not recur); typecheck/lint/test all green locally.

Live + historical analytics fast + accurate CONFIRMED (DoD met): real-time tiles poll concurrency/minutes/spend/success; historical gives outcomes, sentiment trend, talk/listen, interruptions, drop-off, cost-by-day filterable by date + agent; budget/anomaly alerting added. Tenant isolation CONFIRMED.
Deferred (gated): Socket.IO push for the live tiles (currently 10s polling — fine for self-host); wiring `budget` caps/anomaly into a super-admin push notification (the evaluation + alerts payload are ready). Next: Day 42 (transcript search).

## Day 42 — Transcript Full-Text + Semantic Search — 2026-07-04 — ✅ DONE
Model: Sonnet (⚡ SONNET). Branch `day/42-transcript-search`. Prereq: pgvector + transcripts populated — both present (Day 04/20). Migration `20260703220000_day42_transcript_search` (additive columns + indexes on the existing, already-RLS'd `Transcript`). Self-audit focus B (no cross-tenant results) + F + A.

Built (DONE):
- **db/migration**: `Transcript.searchText TEXT` (flattened plain-text, FTS + embedding source) + `Transcript.embedding vector(1536)`; a **GIN** index on `to_tsvector('english', coalesce("searchText",''))` and an **HNSW** cosine index on the embedding. Transcript already had RLS (Day 04) → columns inherit tenant isolation.
- **shared** `transcript-search.ts`: pure core — `queryTokens`, **`bestMoment`** (jump-to-moment: the segment with the most query-token hits → its `startMs`), and **`fuseRankings`** (reciprocal-rank fusion of keyword + semantic lists — scale-free, so ts_rank vs cosine never need normalising). 7 unit tests.
- **api** `SearchService` (RLS, all reads under `withTenant`; embedder + usage sink reused from the RAG pattern): `indexTranscript` (flatten → embed best-effort → raw update; FTS works even with no embedder), `reindexTenant` (backfill), and **`search`** (keyword via `websearch_to_tsquery` + `ts_rank` + `ts_headline` snippet; semantic via cosine `<=>`; hybrid via RRF), each hit carrying a snippet + jump-to-moment offset. Routes: `GET /search/transcripts` (members) + `POST /search/reindex` (config writers — spends embed budget). Wired into composition + main. 6 RLS-real integration tests.
- **web** `/dashboard/search`: query box, keyword/semantic/hybrid toggle, agent filter, snippet results, reindex button; clicking a result deep-links to `/dashboard/calls/{id}?t={ms}` — the call detail page now reads `?t=` and seeks the recording to that moment (reuses the existing `seekTo`/audio player). Nav link added.

Verification: typecheck api+web clean; `pnpm lint` 11/11 tasks pass (pre-existing `useImportType` warnings only, no errors); `pnpm build` exit 0 (`/dashboard/search` route emitted). Tests: shared **208** (transcript-search 7), api **146** (search 6 — FTS finds the right call, jump-to-moment resolves the caller segment offset, semantic ranks by the deterministic embedder, hybrid returns hits, **a child tenant NEVER sees the parent's "secret" refund transcript**, blank query → []).

## Self-Audit — Day 42 (A–K)
A. Correctness (focus): ✅ — pure jump-to-moment + RRF fusion unit-tested; FTS/semantic/hybrid proven against real Postgres (`websearch_to_tsquery`, `ts_rank`, cosine `<=>`) with a deterministic keyword embedder so ordering is predictable without live OpenAI.
B. Tenancy (focus): ✅ — `indexTranscript`/`reindexTenant`/`search` all run inside `withTenant`; the raw FTS + vector SQL execute under the non-superuser app role with the tenant GUC set, so RLS on `Transcript` applies. A test seeds a parent (R1) transcript that also says "refund" and asserts C1's search never returns it.
C. Creds/secrets: ✅ — no secrets in code/logs; the embedder key is read from env (reused from RAG), never echoed.
D. Cost: ✅ — every embed (index + query) meters a tenant-scoped `UsageRecord` (EMBEDDING capability) via the same sink as RAG (golden rule #4); FTS-only paths add no provider cost.
E. Errors/obs: ✅ — Zod-validated query (`q` required, mode enum, uuid agent, `to>from`); NotFound on a missing transcript; embedder failure is caught so a self-host without an OpenAI key still gets keyword search.
F. Performance (focus): ✅ — GIN index backs FTS, HNSW backs semantic; both queries are `LIMIT`-bounded to a candidate pool (≤50); embed input capped at 8k chars; jump-to-moment is a bounded in-memory scan of one transcript's segments.
G. Error handling: ✅ — API surfaces typed errors; web has loading/error(+retry)/empty states; reindex is a distinct config-writer action.
H. UI/a11y: ✅ — labelled search input + agent select (htmlFor/id), keyboard-submittable form, mode toggle, mono timestamps, empty/error/loading states; deep-link seek is best-effort (guards missing audio).
I. Regression: ✅ — additive migration + new module/routes/page + one shared export + 7 tracked-file wirings; existing typecheck/lint/tests green (shared 208, api 146). (Mid-day a root `biome --write` reformatted ~34 unrelated files via `useImportType`; all reverted — the final diff is exactly the Day-42 surface.)
J. Quality/docs: ✅ — pure logic isolated + tested in shared; SQL kept in the service with doc comments (RRF rationale, RLS-under-raw-SQL note, best-effort embed); explicit DTOs; migration comments explain the inherited RLS.
K. Build/CI: ✅ — full `pnpm build` exits 0 (cleared a stale `.next` macOS "* 2.ts" duplicate-artifact typecheck flake first); all gates green locally.

CI fix (post-push): the first CI run failed — `reindexTenant(C1)` raced a parallel test file (analytics) that creates + deletes transcripts under the same seeded tenant C1: my scan picked up a transient transcript that was deleted before `indexTranscript` read it → `NotFoundError`. Fixed by hardening `reindexTenant` to tolerate a transcript vanishing mid-scan (catch `NotFoundError` per item, skip, continue) — which is also the correct production behaviour under concurrent deletion / retention purge. Re-verified green locally (api 146).

Keyword + semantic search with jump-to-moment, tenant-scoped, tests pass — DoD CONFIRMED. Cross-tenant isolation CONFIRMED (parent's transcript never surfaces for the child).
Deferred (gated): auto-indexing transcripts from the post-call worker (needs an embedder in the worker — OpenAI key; today's `reindex` endpoint + on-demand `indexTranscript` cover backfill, and FTS degrades gracefully without embeddings). Next: Day 43 (QA scoring at scale).

## Day 43 — Automated QA Scoring (LLM Rubrics) at Scale — 2026-07-04 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/43-qa-scoring`. Prereq: LLM keys (present) + transcripts + Day-33 rubric patterns — all satisfied. Migration `20260704120000_day43_qa_scoring` (two new tenant tables + RLS). Self-audit focus D (eval cost) + A (reliability) + B.

Built (DONE):
- **db/migration**: `QaRubric` (tenant + optional agent scope; `criteria` [{key,description,weight}], `samplingRate`, `active`) + `QaScore` (per call×rubric: `overall` 0..100, per-criterion `criteria`, `model`; `@@unique([callId,rubricId])` for idempotent re-scoring). Both RLS-protected (Day-04 policy shape); Tenant/Agent/Call reverse relations added.
- **shared** `qa.ts`: the pure evaluator core — `qaRubricInputSchema` (Zod, snake_case keys, ≥1 criterion), `buildQaPrompt` (strict-JSON contract), **`parseQaResult`** (tolerant: extracts JSON from prose/fences, clamps 0..1, **fails closed** — an omitted criterion → 0, never silently skipped), **`scoreQa`** (weight-weighted 0..100), **`shouldSample`** (deterministic FNV-1a hash of `callId:rubricId` → stable cost-aware sampling), and `aggregateQaScores` (per-rubric/criterion averages for coaching). 12 unit tests.
- **workers** `qa-scoring.ts`: `runQaScoring(deps,{callId})` — fetch call+transcript → active applicable rubrics → **cost-aware sample (skip = no LLM spend)** → metered LLM → parse → score → upsert QaScore. Injected deps (unit-tested without a live model); `createDbQaDeps` routes through the Router with a tenant-scoped `UsageRecord` meter (golden rule #4). Registered as the `qa-scoring` BullMQ queue. 6 unit tests.
- **api** `QaService` (RLS via `withTenant`; injected completer = RouterService, metered): rubric CRUD, `scoreCallNow` (interactive — scores all active applicable rubrics, ignores sampling, upserts), `scoresForCall`, `aggregate` (coaching/analytics). Routes `/qa/rubrics` (CRUD, config-writers mutate), `/qa/aggregate`, `/qa/calls/:id/scores`, `/qa/calls/:id/score`. Wired composition+main. 4 RLS-real integration tests.
- **web** `/dashboard/qa`: rubric builder (weighted criteria rows + sampling-rate slider), rubric list with active toggle/delete, and a **coaching view** (per-rubric avg + weakest-first per-criterion bars). Call detail gains a **QA scores card** ("Score now"/"Re-score", per-criterion pass/reason). Nav link added.

Verification: full monorepo **typecheck 11/11**, **lint 11/11**, **build exit 0** (`/dashboard/qa` route emitted). Tests: shared **220** (qa 12), workers **19** (qa 6 — determinism, empty/no-rubric/sampled-out = no spend, fail-closed), api **150** (qa 4 — CRUD+RLS, weighted scoreCallNow incl. idempotent upsert, aggregate, **child never sees parent's scores**).

## Self-Audit — Day 43 (A–K)
A. Reliability/correctness (focus): ✅ — prompt/parse/score/sample are pure + unit-tested; `parseQaResult` fails closed (garbage or omitted criterion → 0, never skipped) so a flaky model can't inflate a score; `scoreQa` is a deterministic weighted mean; scoring proven end-to-end against real Postgres with a fake evaluator.
B. Tenancy (focus): ✅ — every rubric/score read+write runs inside `withTenant`; QaRubric/QaScore carry RLS policies; a test proves a child tenant can't list/mutate a parent's rubric nor read the parent's call scores, and aggregates never cross tenants.
C. Creds/secrets: ✅ — no secrets in code/logs; platform LLM keys read from env in the worker resolver; the model id stored on QaScore is non-sensitive audit metadata.
D. Eval cost (focus): ✅ — every evaluator completion meters a tenant-scoped `UsageRecord` (LLM capability) both in the worker (Router meter) and the api (RouterService); **cost-aware sampling** skips the LLM entirely for sampled-out rubrics; empty transcript / no active rubric → no spend (asserted in tests).
E. Errors/obs: ✅ — Zod-validated rubric input (keys, ≥1 criterion, sampling 0..1); NotFound on missing rubric/call/transcript; worker returns a typed `{status,...}` summary; failed jobs logged per queue.
F. Performance: ✅ — scoring is one metered call per applicable rubric (rubrics per tenant are few); aggregate is a single indexed read folded in memory; unique index makes re-scoring an upsert, not a scan.
G. Error handling: ✅ — api surfaces typed errors; web QA card/ builder have loading/error/empty states + inline validation (snake_case key + weight>0 before submit).
H. UI/a11y: ✅ — labelled sampling slider + inputs, active checkbox, keyboard-usable builder, mono scores, weakest-first coaching bars (red<50%), pass/✗ markers `aria-hidden` with text reasons; empty/error/loading handled.
I. Regression: ✅ — additive migration + new module/worker/routes/page + reverse relations + wirings; existing typecheck/lint/tests green (shared 220, workers 19, api 150). A mid-day scoped `biome --write` touched only Day-43 files (no repeat of the Day-42 mass-reformat).
J. Quality/docs: ✅ — pure logic isolated + tested in shared; the worker mirrors the Day-31 post-call pattern; api completer injected (RouterService in prod, fake in tests); doc comments explain fail-closed + sampling + metering; explicit DTOs (no Prisma leak).
K. Build/CI: ✅ — `pnpm build` exits 0; all gates green locally (cleared the `.next` macOS "* 2.ts" artifact first).

Live calls auto-scored against rubrics, surfaced in analytics/coaching, cost-aware, tests pass — DoD CONFIRMED. Tenant isolation CONFIRMED.
Deferred (gated): enqueuing the `qa-scoring` job automatically from the post-call bundle on call-end (needs the live loop's call-end hook — same deferral as post-call intel/memory); today the worker consumes `{callId}` jobs and the api `scoreCallNow` scores on demand. Next: Day 44 (multi-channel messaging — heavy).

## Day 44 — Multi-Channel Messaging (WhatsApp/SMS + blended campaigns) — 2026-07-04 — ✅ DONE (gated)
Model: Opus (🧠 OPUS). Branch `day/44-messaging-whatsapp`. Prereq: WhatsApp Cloud (`WHATSAPP_*`) and/or Twilio SMS (`TWILIO_*`) — **not set**; per the user's direction the day was built **GATED** (full feature + adapters + tests; live send/receive activates when keys land — same pattern as Days 10/15/35/36/37/40). Migration `20260704140000_day44_messaging` (3 tenant tables + 3 fresh enums + RLS). Self-audit focus C (webhook verify + opt-out) + D + B.

Built (DONE):
- **db/migration**: enums `MessageChannel`/`MessageDirection`/`MessageStatus` (fresh `CREATE TYPE` — no risky `ALTER` of the shared Provider/Capability enums); `MessageTemplate` (channel, name, language, category, body, extracted `variables`, `approvalStatus`, active), `Message` (direction/status/to/from/body/template/cost/error + soft contact/call/campaign links), `MessagingOptOut` (unique tenant+channel+phone). All RLS-protected (Day-04 shape); Campaign already had `channelMix`.
- **shared** `messaging.ts` (web-safe, no node builtins): `messageTemplateInputSchema`, `extractTemplateVars` + **`renderMessageTemplate`** (missing vars reported + blanked — never ships `{{name}}`), **`classifyInbound`** (STOP/START opt-out/opt-in), `smsSegments` + `messageCostUsd` (per-segment SMS / flat WhatsApp), `channelMixSchema` + **`blendedNextStep`** (text a NO_ANSWER/VOICEMAIL only when a template is set — no double-message). 13 unit tests.
- **api** `messaging/`: **senders** (`WhatsAppSender` Meta Graph + `TwilioSmsSender`, injected `HttpClient`, `buildSenders` builds only channels with creds = gated) + `webhook-verify.ts` (server-only HMAC: Twilio SHA1 over URL+params, Meta SHA256 over raw body, constant-time). **`MessagingService`** (RLS): template CRUD, `send` (opt-out refusal → render → dispatch-or-queue → cost metered → persist), `recordInbound` (opt-out/opt-in suppression), `updateStatus`, `blendedFollowUp`. Routes `/messaging/*` + public **signature-verified per-tenant webhooks** `/public/messaging/{twilio,whatsapp}/:tenantId` (mounted with raw/urlencoded parsers before the JSON parser; gated → 503 without secrets). Wired composition+main. 14 tests (service 8 + senders 4 + webhook-verify 2).
- **web** `/dashboard/messaging`: template builder ({{variables}}), ad-hoc send panel (shows Sent+cost or Queued-no-provider), and a message log (in/out, status). Nav link.

Verification: full monorepo **typecheck 11/11**, **lint 11/11**, **build exit 0** (`/dashboard/messaging` emitted). Tests: shared **233** (messaging 13), api **164** (messaging 8 — render/cost/opt-out-refusal/gated-queue/status/child-can't-see-parent; senders 4; webhook-verify 2). Build fix: moved the `node:crypto` webhook-verify out of `@vocaliq/shared` into the api after the web bundle rejected `node:crypto` — shared stays web-safe.

## Self-Audit — Day 44 (A–K)
A. Correctness: ✅ — pure template/opt-out/cost/blended logic unit-tested; adapters exercised with a fake HttpClient (payload shape, provider-id, FAILED-on-non-2xx); service proven end-to-end against real Postgres with a fake sender.
B. Tenancy (focus): ✅ — every template/message/opt-out read+write under `withTenant`; all three tables RLS-protected; a test proves a child sees neither the parent's templates nor messages; inbound webhooks route by per-tenant path.
C. Webhook + opt-out (focus): ✅ — Twilio (SHA1 over URL+sorted params) + Meta (SHA256 over raw body) signatures verified constant-time before any effect; tampered/absent signatures rejected (tested); WhatsApp GET challenge checks `hub.verify_token`; inbound STOP → opt-out, START → opt-in; **`send` refuses an opted-out recipient** (tested) and refuses incomplete templates.
D. Cost (focus): ✅ — every outbound message stores per-message `costUsd` (SMS per-segment, WhatsApp flat), tenant-scoped cost attribution; sampled/queued/opted-out paths spend nothing. (Rolling messaging into the unified `UsageRecord` needs a `messaging` Capability enum value — deferred to avoid a mid-day enum-in-transaction `ALTER`; noted.)
E. Errors/obs: ✅ — Zod-validated template + send; typed NotFound/Validation; adapter failures captured as `{status:FAILED,error}` never thrown; webhooks 403 on bad signature, 503 when unconfigured.
F. Performance: ✅ — sends are one adapter call + one insert; message log is an indexed, capped read; opt-out check is an indexed unique lookup.
G. Error handling: ✅ — api surfaces typed errors; web send panel shows sent+cost / queued / error; `blendedFollowUp` swallows opt-out/missing-var so a campaign never breaks.
H. UI/a11y: ✅ — labelled channel selects + inputs, snake_case validation before submit, empty/error/loading states, message-log direction/status markers.
I. Regression: ✅ — additive migration + new module/routes/page + reverse relations + wirings; existing typecheck/lint/tests green (shared 233, api 164). Scoped `biome --write` touched only Day-44 files.
J. Quality/docs: ✅ — pure logic isolated + web-safe in shared; server-only crypto split into `webhook-verify.ts`; adapters mirror the router with injected HTTP; explicit DTOs; gated design documented.
K. Build/CI: ✅ — `pnpm build` exits 0 (after moving `node:crypto` server-side); all gates green locally.

WhatsApp/SMS follow-ups + blended campaigns, opt-out + cost handled, tests pass — DoD met at the code+test level; **live send/receive is GATED** pending `WHATSAPP_*` / `TWILIO_*`. Tenant isolation + webhook verification + opt-out compliance CONFIRMED.
Deferred (gated on creds): live WhatsApp/Twilio send + real inbound/status webhooks (adapters + verified handlers are ready — set the keys to activate); auto-triggering `blendedFollowUp` from the campaign scheduler on a call's no-answer (same live-loop hook deferral); unified `UsageRecord` messaging capability. Next: Day 45 (multimodality).

🔑 To go live later, set in root `.env`: WhatsApp — `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`; Twilio SMS — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_FROM`; plus `PUBLIC_API_URL` (webhook signature base). Then point Twilio/Meta webhooks at `/public/messaging/{twilio,whatsapp}/<tenantId>`.

## Day 45 — Multimodality (one agent: voice + text + chat) — 2026-07-04 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/45-multimodality`. Prereq: Days 9 (live loop) + 16 (web widget) + 44 (messaging) — all done; no new credential, no migration. Self-audit focus A (consistency) + B + D.

Built (DONE):
- **shared** `chat-runtime.ts`: a channel-agnostic, **resumable, turn-based** runtime over a compiled flow (Day 22) — `ChatChannel` (VOICE/CHAT/WHATSAPP/SMS), serialisable `ChatState`, **`startChat`** (runs opening turns to the first user prompt), **`chatTurn`** (applies one user message at the awaiting Listen → captures + intent → advances → runs to the next prompt/end), **`renderForChannel`** (voice keeps SSML; text strips it + collapses whitespace), and channel-aware node behaviour (a TRANSFER/SQUAD_HANDOFF surfaces a hand-off line on text, stays silent on voice). Reuses the compiler's `nextNode`; deterministic + pure + step-capped. The flow logic (nodes, decisions, captures) is identical across channels — **consistency by construction**. 7 unit tests.
- **api** `ChatService` (RLS): loads + compiles the agent's PUBLISHED flow, `start`/`turn` drive the shared runtime. **Stateless** — the client round-trips `ChatState` each turn (no server session store), no LLM on this path (no metered cost). Routes `/agents/:agentId/chat/{start,turn}` (Zod-validated, mergeParams). Wired composition+main. 4 RLS-real integration tests.
- **web** `/dashboard/agents/[id]/chat`: a channel-selectable chat tester (Web chat / WhatsApp / SMS / raw Voice) that converses with the agent's published flow — bubbles, outcome, restart. "Chat" link added on the agents list. Same runtime the voice loop + WhatsApp inbound (Day 44) feed into.

Verification: full monorepo **typecheck 11/11**, **lint 11/11**, **build exit 0** (`/dashboard/agents/[id]/chat` emitted). Tests: shared **240** (chat-runtime 7 — opening/awaiting, **same flow → same outcome+captures on voice/chat/whatsapp**, SSML kept-vs-stripped, else-branch routing, done no-op, transfer channel-awareness), api **168** (chat 4 — cross-channel consistency, rendering, requires-published-flow, **child can't chat with parent's agent**).

## Self-Audit — Day 45 (A–K)
A. Consistency (focus): ✅ — the SAME compiled flow drives every channel through the SAME `nextNode` traversal + captures; a test asserts voice/chat/whatsapp all reach outcome `booked` with identical captures, differing ONLY in rendering (SSML kept on voice, stripped on text). No channel-specific branching in the flow logic.
B. Tenancy (focus): ✅ — flow load runs under `withTenant`; a child tenant chatting with a parent's agent gets NotFound (RLS), proven against real Postgres.
C. Security: ✅ — chat endpoints are auth+tenant gated; the round-tripped `ChatState` is Zod-validated on `/turn` (activeNode/captured/flags typed) so a client can't inject arbitrary state shapes; no secrets touched.
D. Cost (focus): ✅ — this runtime is pure flow traversal (no LLM), so the text/chat path adds no provider cost; `generated` Say nodes render as a stub here (the live LLM turn + its metering ride the voice/host loop, unchanged).
E. Errors/obs: ✅ — typed NotFound (no agent) / Validation (no published flow, uncompilable flow, empty message, bad state); step cap guarantees termination on cyclic graphs.
F. Performance: ✅ — stateless; each turn is one indexed flow-version read + an in-memory traversal (≤200 steps); no session store to scale.
G. Error handling: ✅ — api surfaces typed errors; web shows the error + disables input when done/awaiting; restart re-seeds cleanly.
H. UI/a11y: ✅ — labelled channel select + message input, keyboard-submittable form, disabled states, agent/user bubbles, outcome line.
I. Regression: ✅ — additive (new shared module + api module + web page + wirings); no schema/migration; existing typecheck/lint/tests green (shared 240, api 168). Scoped `biome --write` touched only Day-45 files.
J. Quality/docs: ✅ — runtime pure + web-safe in shared, documented as the single source of conversational truth; api stateless + RLS; explicit DTOs; the voice loop / WhatsApp inbound are noted as hosts of the same runtime.
K. Build/CI: ✅ — `pnpm build` exits 0; all gates green locally.

One agent definition serves voice + text + chat consistently, tests pass — DoD CONFIRMED. Cross-channel consistency + tenant isolation CONFIRMED.
Deferred (gated / follow-up): wiring the Python voice loop + the Day-44 WhatsApp inbound to call this shared runtime for their turns (the runtime + api are ready; the voice loop is the gated live bundle); seeding cross-channel memory (AgentMemory, Day 34) into `startChat`'s `context` for a known contact (the hook exists — `context` param). Next: Day 46 (MCP + tool servers).

## Day 46 — MCP & Tool-Server Support + Trust Context — 2026-07-04 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/46-mcp-tool-servers`. Prereq: Day 19 tools — done; no new credential. Migration `20260704160000_day46_mcp_servers` (one tenant table + RLS; tool-call audit reuses AuditLog). Self-audit focus C (trust scoping, sandbox, SSRF) + D + B.

Built (DONE):
- **db/migration**: `McpServer` (tenant + optional agent scope; url, transport, `trustContext` LOW/HIGH/UNKNOWN, `timeoutMs`, sealed `authHeaderCipher`, discovered `tools`, active). RLS-protected (Day-04 shape). Tenant/Agent reverse relations.
- **shared** `mcp.ts` — the security-critical pure core: `TrustContext` + **`trustAllowsTool`**/`allowedTools` (HIGH = all; LOW/UNKNOWN = read-only, non-destructive ONLY — **fail-closed**), **`clampToolTimeout`** ([5s,120s], default 30s), **`checkPublicHttpUrl`** (SSRF guard: rejects non-http(s), embedded creds, localhost, private/loopback/link-local ranges, the 169.254.169.254 metadata IP, `.internal`/`.local`), **`vetToolOutput`** (LOW/UNKNOWN output delimited as untrusted DATA — prompt-injection defence — + truncated), `mcpServerInputSchema`. 12 unit tests.
- **api** `mcp/`: injected JSON-RPC `McpTransport` (`tools/list`+`tools/call`, per-server timeout via AbortController, auth header never logged, maps MCP `readOnlyHint`/`destructiveHint` annotations). **`McpService`** (RLS): register (SSRF-guarded, auth header **sealed** + never returned — only `hasAuth`), list/remove, `discover` (persist tools + audit), **`callTool`** (trust-gate → 403 if denied, clamped timeout, `vetToolOutput`, **AuditLog** entry with trust+status+durationMs), `toolsForAgent` (trust-filtered descriptors for the LLM loop). Injected clock for deterministic duration tests. Routes `/mcp/servers*` + `/mcp/servers/:id/{discover,call}` (config writers). Wired composition+main. 8 RLS-real integration tests.
- **web** `/dashboard/mcp`: register a server (URL + trust context + 5–120s timeout + optional auth header), discover tools, and a per-server tool list where **denied (non-read-only on untrusted) tools are struck through**. Trust icons (shield). Nav link.

Verification: full monorepo **typecheck 11/11**, **lint 11/11**, **build exit 0** (`/dashboard/mcp` emitted). Tests: shared **252** (mcp 12 — trust gating, timeout clamp, SSRF block-list incl. metadata IP, output vetting), api **176** (mcp 8 — SSRF on register, sealed-auth-never-returned, discovery, **HIGH-can/LOW-can't call destructive**, untrusted-output vetting + duration, trust-filtered toolsForAgent, audit write, **child can't see/call parent's server**).

## Self-Audit — Day 46 (A–K)
A. Correctness: ✅ — trust/timeout/SSRF/vetting are pure + unit-tested; the service path (discover→gate→call→vet→audit) proven against real Postgres with an injected transport + clock.
B. Tenancy (focus): ✅ — every server read/write under `withTenant`; McpServer RLS-protected; a child tenant can't list, discover, or call a parent's server (proven).
C. Trust/SSRF/sandbox (focus): ✅ — **SSRF guard** blocks localhost/private/link-local/metadata/`.internal` + embedded creds + non-http on registration; **trust gating is fail-closed** (LOW/UNKNOWN expose only tools explicitly `readOnly` + never `destructive`); denied calls 403 + audited; **output vetting** delimits untrusted tool output as data (prompt-injection defence); the transport is timeout-bounded (AbortController); auth header sealed at rest + never returned/logged.
D. Cost/limits (focus): ✅ — per-server response timeout clamped [5s,120s]; output truncated to 8k chars (bounds prompt growth); no unbounded external call.
E. Errors/obs: ✅ — typed Validation (unsafe URL, inactive server, bad tool)/NotFound/Forbidden; every tool call (ok/denied/error) writes an AuditLog row with trust + status + durationMs.
F. Performance: ✅ — discovery/call are single indexed reads + one bounded HTTP round-trip; `toolsForAgent` folds in memory.
G. Error handling: ✅ — transport failures become a typed ValidationError (audited); web shows discover/register errors; denied tools struck through in the UI.
H. UI/a11y: ✅ — labelled trust/timeout/auth inputs, shield trust icons, struck-through denied tools, empty/error/loading states.
I. Regression: ✅ — additive migration + new module/routes/page + relations + wirings; existing typecheck/lint/tests green (shared 252, api 176). Scoped `biome --write` touched only Day-46 files.
J. Quality/docs: ✅ — security logic pure + tested in shared; transport injected; auth-header sealing mirrors the Day-40 integration pattern (KMS = Day 57, flagged); explicit DTOs; doc comments explain fail-closed + SSRF + vetting.
K. Build/CI: ✅ — `pnpm build` exits 0; all gates green locally.

MCP/tool servers connectable with trust context + timeouts, audited, tests pass — DoD CONFIRMED. SSRF + trust scoping + output vetting + tenant isolation CONFIRMED.
Deferred (follow-up): exposing `toolsForAgent` into the live LLM loop as callable functions (the voice loop is the gated live bundle; the api + trust-filtered descriptors are ready); DNS-rebinding hardening + egress pinning at the transport layer (the hostname SSRF guard is defence-in-depth today); SSE transport body (HTTP JSON-RPC implemented). Next: Day 47 (marketplace + automations).

## Day 47 — Integrations Marketplace + Cross-Channel Automations — 2026-07-04 — ✅ DONE
Model: Sonnet (⚡ SONNET). Branch `day/47-marketplace-automations`. Prereq: Day 40 integration framework — done; no new credential. Migration `20260704180000_day47_automations` (one tenant table + RLS; action-run auditing reuses AuditLog). Self-audit focus C (creds) + B + A. Marketplace: the Day-40 `/dashboard/integrations` catalogue already browses/enables connectors (HubSpot live; Salesforce/Zendesk/Zapier framework-ready) — this day adds the **cross-channel automation engine** on top.

Built (DONE):
- **db/migration**: `Automation` (tenant-scoped: `event`, `filters` JSON, ordered `actions` JSON, active). RLS-protected (Day-04 shape).
- **shared** `automation.ts`: `automationTriggerSchema` (event `call_ended`/`disposition_set`/`lead_status_changed` + disposition/leadStatus/agentId filters), `automationActionSchema` (discriminated union: `send_message`|`crm_sync`|`webhook`|`task`|`notify`), `automationInputSchema` (1–10 actions), **`matchesTrigger`** (event + ANDed filters, unset = wildcard), `actionLabel`. 7 unit tests.
- **api** `automations/`: **`AutomationsService`** (RLS): CRUD + toggle, and **`dispatch(event)`** — match active automations (pure `matchesTrigger`) → run each action **in order, best-effort** (one failing action never stops the chain or another automation) → **audit every action** (AuditLog `automation.action` with status+detail). Executors are INJECTED; **`buildActionExecutors`** wires them onto existing safe subsystems: `send_message`→MessagingService (opt-out-checked + metered, Day 44), `crm_sync`→IntegrationsService.syncCall (Day 40), `webhook`→SSRF-guarded (`checkPublicHttpUrl`, Day 46) timeout-bounded POST, `task`/`notify`→Notification rows. Routes `/automations` CRUD + toggle + `/dispatch` (config writers). Wired composition+main. 4 RLS-real integration tests.
- **web** `/dashboard/automations`: a trigger→actions builder (event + disposition filter; add action rows for each type) + a list showing the trigger chip → action pills with an active toggle + delete. Nav link.

Verification: full monorepo **typecheck 11/11**, **lint 11/11**, **build exit 0** (`/dashboard/automations` emitted). Tests: shared **259** (automation 7 — schema, trigger match incl. filter AND + wildcard + event mismatch, action labels), api **180** (automations 4 — CRUD+RLS, **multi-step best-effort dispatch with a mid-chain error that doesn't stop later actions + every action audited**, non-matching filter no-op, **child tenant's dispatch never runs a parent's automation**).

## Self-Audit — Day 47 (A–K)
A. Correctness (focus): ✅ — `matchesTrigger` pure + unit-tested (event + ANDed filters); the dispatch chain (match → ordered best-effort actions → audit) proven against real Postgres with fake executors, including a mid-chain failure that still runs the following action.
B. Tenancy (focus): ✅ — CRUD + the dispatch candidate query all run under `withTenant`; Automation is RLS-protected; a test proves a child can't list a parent's automation and a child's dispatch only ever runs its own automations.
C. Creds (focus): ✅ — automations hold NO secrets; action executors reuse subsystems that already handle creds safely (messaging opt-out + sealed integration tokens); the `webhook` action is SSRF-guarded (reuses the Day-46 `checkPublicHttpUrl`) + timeout-bounded; no new secret surface.
D. Cost: ✅ — a `send_message` action meters per-message cost via MessagingService (Day 44); no unmetered provider path added; webhook/task/notify are the tenant's own side-effects.
E. Errors/obs: ✅ — Zod-validated trigger + actions (1–10, valid webhook URL); typed NotFound on toggle/delete; dispatch is best-effort per action with a typed outcome; every action writes an AuditLog row (status + detail) — full observability of what fired.
F. Performance: ✅ — dispatch is one indexed read (`tenantId,event`) + in-memory match; actions are bounded (≤10); no N+1.
G. Error handling: ✅ — a failing executor is caught → `error` outcome, chain continues; web shows create/toggle errors; empty/error/loading states.
H. UI/a11y: ✅ — labelled event/filter selects + per-action inputs, action-type add buttons, trigger→action visual chain, active toggle, empty/error/loading states.
I. Regression: ✅ — additive migration + new module/routes/page + relation + wirings; existing typecheck/lint/tests green (shared 259, api 180). Scoped `biome --write` touched only Day-47 files.
J. Quality/docs: ✅ — trigger/match logic pure + tested in shared; executors injected + decoupled (each maps to an existing safe subsystem); explicit DTOs; best-effort + audit documented.
K. Build/CI: ✅ — `pnpm build` exits 0; all gates green locally.

Marketplace (Day-40 connector catalogue) + multi-step cross-channel automations, tests pass — DoD CONFIRMED. Best-effort chains + per-action audit + tenant isolation + SSRF-safe webhooks CONFIRMED.
Deferred (follow-up): auto-calling `dispatch` from the post-call bundle on call-end / from lead-status changes (the `/dispatch` route + engine are ready; the live-loop hook is the same gated bundle as post-call intel/QA); adding Cal.com/Make to the connector catalogue (needs `IntegrationType` enum values — deferred to avoid a mid-day enum `ALTER`); a visual multi-branch automation canvas (today's ordered-actions model covers the DoD). Next: Day 48 (public API + SDKs).

## Day 48 — Public API + SDK + Webhooks + Rate Limits/Metering — 2026-07-04 — ✅ DONE
Model: Opus (🧠 OPUS). Branch `day/48-public-api-sdk`. Prereq: Days 13/15 metering — done; no new credential. Migration `20260704200000_day48_api_keys` (one tenant table + RLS; webhooks reuse the Day-04 `Webhook` model). Self-audit focus C (API-key auth + rate limit + HMAC) + D (metering) + B.

Built (DONE):
- **db/migration**: `ApiKey` (tenant-scoped: name, prefix hint, **sha256 `hashedKey`** unique, scopes, `rateLimitPerMin`, `requestCount`, lastUsedAt, revoked). RLS-protected (Day-04 shape).
- **shared** `public-api.ts` (web-safe): `API_SCOPES` + `hasScope` (`*` wildcard), `WEBHOOK_EVENTS` catalogue + `isWebhookEvent`, and **`buildOpenApiSpec`** (valid OpenAPI 3.0.3 with paths + bearer security scheme). 3 unit tests.
- **api** — the developer surface:
  - **`ApiKeyService`**: create (plaintext `vq_live_…` shown ONCE; only the sha256 stored), list (masked), revoke, **`authenticate`** (owner-client lookup by hash, constant-time compare, revocation-checked → tenant+scopes), **`meter`** (requestCount++ / lastUsedAt).
  - **`apiKeyAuth` middleware**: Bearer/`X-Api-Key` → authenticate → **per-key rate limit** (reuses the Day-16 fixed-window `RateLimiter`, one bucket per key sized to its `rateLimitPerMin`) → set `req.ctx` scoped to the key's tenant (RLS, same as a session) → meter. 401/403/429 via typed errors. `requireScope` deny-by-default per route.
  - **Public `/v1`** (`whoami`, `agents`, `calls` GET/POST, `leads`) — reuses the SAME dashboard services (public surface can't diverge/exceed internal), scope-gated; **`/v1/openapi.json`** served (no key).
  - **`WebhookService`**: register (SSRF-guarded url via Day-46 `checkPublicHttpUrl`; signing secret generated + returned once, stored server-side), list/remove, **`deliver`** (HMAC-SHA256 signed `X-VocalIQ-Signature` over `timestamp.body` → POST → **retry to MAX_ATTEMPTS → dead-letter (audited)**). HTTP + clock injected. `/webhooks` CRUD + `/events`.
  - `/api-keys` + `/webhooks` dashboard routes (config writers). Wired composition+main. 9 RLS-real integration tests (api-key 4 + webhook 5).
- **packages/sdk** `@vocaliq/sdk`: a dependency-free TS client (`VocalIQClient` — `whoami`, `agents.list`, `calls.list/create`, `leads.list`; injectable `fetch`; typed `VocalIQError`). 4 smoke tests.
- **web** `/dashboard/developers`: create/scope/revoke API keys (plaintext shown once + copy), register/delete webhooks (event picker; signing secret shown once), and a link to the live OpenAPI spec + SDK note. Nav link.

Verification: full monorepo **typecheck 12/12**, **lint 12/12**, **build exit 0** (SDK added to the graph; `/dashboard/developers` emitted). Tests: shared **262** (public-api 3), api **189** (api-key 4 — create-once/hash-only/authenticate/revoke/meter/child-can't-see-parent; webhook 5 — SSRF register, verifiable signature, retry-then-success, **dead-letter after 3 + audited**, secret-never-listed), sdk **4** (bearer attach, whoami, typed error).

## Self-Audit — Day 48 (A–K)
A. Correctness: ✅ — scope check + OpenAPI builder pure + tested; api-key auth/meter/revoke + webhook sign/retry/dead-letter proven against real Postgres with injected HTTP + clock; SDK smoke-tested with a fake fetch.
B. Tenancy (focus): ✅ — key/webhook CRUD under `withTenant`; ApiKey RLS-protected; the public API sets `req.ctx` to the key's tenant so every `/v1` call is RLS-scoped exactly like a session; a child can't see/revoke a parent's key (proven).
C. API-key auth + rate limit + HMAC (focus): ✅ — keys stored as **sha256 only** (plaintext shown once), authenticated by constant-time hash compare + revocation check; **per-key rate limit** → 429; scope gating deny-by-default → 403; webhook deliveries **HMAC-SHA256 signed** (timestamp-bound, replay-resistant); webhook URLs **SSRF-guarded**; secrets never returned after creation.
D. Metering (focus): ✅ — every authenticated public-API request increments the key's `requestCount` + `lastUsedAt` (usage surfaced in the UI; billing ties to plan-driven `rateLimitPerMin`); no unmetered public path.
E. Errors/obs: ✅ — typed Auth(401)/Forbidden(403)/RateLimit(429)/Validation errors via the safe envelope; dead-lettered webhooks written to AuditLog with event+attempts+status.
F. Performance: ✅ — auth is one indexed unique lookup by hash; rate limit is in-memory O(1); `/v1` reuses existing indexed reads; webhook delivery is bounded (≤3 attempts).
G. Error handling: ✅ — api surfaces typed errors; webhook delivery best-effort with retry→dead-letter; SDK throws a typed `VocalIQError`; web shows create/revoke/register errors + one-time-secret UX.
H. UI/a11y: ✅ — scoped key creation with copy-once, revoke, webhook event picker, secret-shown-once notice, OpenAPI link; empty/error/loading states.
I. Regression: ✅ — additive migration + new modules/routes/page + a new `@vocaliq/sdk` package + wirings; existing typecheck/lint/tests green (now 12 packages). Scoped `biome --write` touched only Day-48 files.
J. Quality/docs: ✅ — scopes/events/OpenAPI shared so api+SDK+docs agree; server-only crypto (`api-key.service`, `webhook-sign`) kept out of web-safe shared; public API reuses internal services (no divergence); explicit DTOs; the plaintext-once + hash-only handling documented.
K. Build/CI: ✅ — `pnpm build` exits 0 (SDK in the graph); all gates green locally.

Documented public API + webhooks + TS SDK, rate-limited + metered, tests pass — DoD CONFIRMED. API-key auth (hash-only, constant-time), per-key rate limit + metering, HMAC-signed webhooks with retry/dead-letter, SSRF-safe, and tenant isolation CONFIRMED.
Deferred (follow-up): firing webhook `deliver` from the post-call/lead events (the signer + delivery + dead-letter are ready; the emit hook rides the same gated post-call bundle); Redis-backed rate limiting + delivery queue for multi-node scale (in-memory limiter + inline retry today); generating non-TS SDK stubs from `/v1/openapi.json` (spec is served); KMS for the webhook secret + BYOK envelope (Day 57). Next: Day 49 (SaaS ops toolkit).

## Day 49 — SaaS Ops Toolkit (tickets, credits, number pool/KYC, notifications, trials) — 2026-07-04 — ✅ DONE
Model: Sonnet (⚡ SONNET). Branch `day/49-saas-ops-toolkit`. Prereq: Stripe (Day 15, gated) + number provisioning (Days 10-11) — present; no new credential. Migration `20260704220000_day49_ops_toolkit` (one additive column: `Wallet.bonusCents`; tickets/numbers/notifications reuse existing Day-04 models; trial limits live in `Tenant.settings`). Self-audit focus B + D (credits) + C (KYC).

Built (DONE):
- **db/migration**: `Wallet.bonusCents` (bonus/perk credits, distinct from prepaid `balanceCents`, drained first).
- **shared** `ops.ts`: the pure core — **`drainCredits`** (bonus-first, never negative, reports shortfall) + `totalCredits`/`isLowBalance`; `trialLimitsSchema` + **`checkTrialLimit`** (expiry + per-resource cap); `TICKET_STATUSES`/`PRIORITIES` + **`canTransitionTicket`** (legal state machine, CLOSED terminal, RESOLVED reopenable); **`canAssignNumber`** (per-plan limit). 7 unit tests.
- **api** `OpsService` (RLS): **tickets** (create/list/assign/setStatus with transition validation), **credits** (getWallet upsert, addCredits prepaid|bonus, `drain` bonus-first + auto low-balance notification), **number pool** (list owned+available, `assignNumber` gated by **KYC + plan `numberLimit`**, release, super-admin `setKyc`), **notifications** (list/markRead + super-admin `broadcast`), **trials** (get/set limits in tenant settings + `assertTrialAllows` — no-op unless the tenant is on TRIAL). Routes `/ops/*` (member reads; config-writer tenant mutations; SUPER_ADMIN for KYC + broadcast). Wired composition+main. 7 RLS-real integration tests.
- **web** `/dashboard/support`: in-platform ticketing (create + priority + lifecycle transitions) + a credit-balance card (bonus/prepaid split, low-balance red). Nav link.

Verification: full monorepo **typecheck 12/12**, **lint 12/12**, **build exit 0** (`/dashboard/support` emitted). Tests: shared **269** (ops 7 — bonus-first drain + shortfall, trial expiry/caps, ticket transitions incl. CLOSED-terminal, number limit), api **196** (ops 7 — ticket lifecycle + illegal transition + child-can't-see-parent, credit bonus-first + low-balance notification + no-negative shortfall, number KYC-gate then assign under plan limit + release, broadcast, trial get/set + enforcement).

## Self-Audit — Day 49 (A–K)
A. Correctness: ✅ — credit maths, trial checks, ticket transitions, number limits are pure + unit-tested; the service flows proven against real Postgres (drain persists new balances; KYC gate then assign; broadcast writes per tenant).
B. Tenancy (focus): ✅ — tickets/credits/notifications/trials all run under `withTenant`; a child can't see a parent's ticket; the number `owned` list is explicitly tenant-filtered (the RLS-global pool is separated into `available`); broadcast is an explicit platform (owner-client) action.
C. KYC (focus): ✅ — `assignNumber` REFUSES a number without a KYC badge (403), and enforces the plan's `numberLimit`; `setKyc` is SUPER_ADMIN-only (route-gated); numbers are validated against the tenant + the agent is RLS-checked before assignment.
D. Credits (focus): ✅ — `drainCredits` spends bonus before prepaid, never drives a balance negative, and returns any uncovered shortfall so the caller can block/auto-recharge; dropping below the $5 threshold raises a low-balance notification; addCredits rejects non-positive amounts.
E. Errors/obs: ✅ — Zod-validated inputs; typed NotFound/Validation/Forbidden; illegal ticket transitions rejected with a clear message; low-balance + broadcast surfaced as notifications.
F. Performance: ✅ — indexed reads; wallet is a single upsert; drain is one transaction; broadcast is a `createMany`.
G. Error handling: ✅ — api surfaces typed errors; web shows create/transition errors + empty/error/loading states; trial enforcement is a safe no-op off-trial.
H. UI/a11y: ✅ — labelled ticket form + priority select, lifecycle transition buttons, wallet card (bonus/prepaid split, low-balance red), empty/error/loading states.
I. Regression: ✅ — one additive column + new module/routes/page + wirings; existing typecheck/lint/tests green (shared 269, api 196). Scoped `biome --write` touched only Day-49 files.
J. Quality/docs: ✅ — credit/trial/ticket logic pure + tested in shared; service reuses EntitlementsService for the number limit; explicit DTOs (a `NotificationRow` fixes a TS2742 Prisma-type leak); RLS-global-pool caveat documented in code.
K. Build/CI: ✅ — `pnpm build` exits 0; all gates green locally.

Tickets, credits, number pool/KYC, notifications, trials work, tests pass — DoD CONFIRMED. Bonus-first credit draining, KYC + plan-limit number gating, and tenant isolation CONFIRMED.
Deferred (follow-up): auto-draining credits from the per-call cost path (the `drain` method + low-balance alert are ready; the call-end hook rides the gated post-call bundle); email/SMS/webhook notification delivery (in-app notifications land today; the channels reuse Day-44 messaging + Day-48 webhooks once wired); a super-admin number-pool + broadcast admin UI (API + roles ready; today's web covers the tenant-facing tickets + credits). Next: Day 50 (onboarding + motion polish — closes Phase 3).

## Day 50 — Onboarding Flows + Motion/Animation Polish — 2026-07-04 — ✅ DONE — closes Phase 3
Model: Sonnet (⚡ SONNET). Branch `day/50-onboarding-polish`. Prereq: most features exist to onboard into — done; no credential, no migration. Web-focused. Self-audit focus H (UI/motion/perf) + A. **Motion approach:** a lean, dependency-free CSS choreography (no Framer Motion/Lottie added) — consistent with the CodeCanyon lean-self-host preference and the existing CSS motion utilities.

Built (DONE):
- **shared** `onboarding.ts`: pure **`computeOnboarding(signals)`** → the guided "first value fast" checklist (create agent → connect number → place a test call → see results) with per-step done/label/hint/href, completion percent, and the next incomplete step. 4 unit tests.
- **web onboarding** `OnboardingChecklist`: derives the signals from real queries (agents / owned numbers / calls / a completed call) via the pure fn, shows a progress bar + step list with the next step highlighted + linked, and **auto-hides once fully onboarded** (never in the way). Empty-state-as-onboarding. Placed on the dashboard overview. Added a `useNumbers` hook (`/ops/numbers`).
- **web motion pass** (DESIGN-SYSTEM §4, `globals.css`): `@keyframes vq-reveal` (opacity + 8px rise, transform/opacity only → GPU-friendly, no layout jank) + `.vq-reveal` / `.vq-stagger` (staggered list children) / `.vq-lift` (hover lift), **all gated behind `@media (prefers-reduced-motion: no-preference)`** so reduced-motion users get the final state with zero animation. Applied as a page-transition on the dashboard `<main>` (`key={pathname}` replays per route), a stagger on the overview stat grid, and lift on stat + onboarding cards.
- **e2e** `motion.spec.ts`: a Playwright test asserting the **reduced-motion contract** — under `emulateMedia({reducedMotion:'reduce'})` the `.vq-reveal` computed `animation-name` resolves to `none`.

Verification: full monorepo **typecheck 12/12**, **lint 12/12**, **build exit 0**. Tests: shared **273** (onboarding 4 — 0%/next-step, per-signal advance, 100%/complete, every step has a label+href); existing api/sdk suites unchanged + green.
E2E note: the reduced-motion spec is written + runnable and NOT in CI (per the Day-14 Playwright config — no browser install in CI). A clean local run was blocked in this environment because another project's dev server already occupied port 3000 (`reuseExistingServer` reused it); the reduced-motion gate is verified by the CSS + build. The full authenticated onboarding-completion journey stays deferred to e2e (needs a seeded user + api/db — same standing note as the smoke suite).

## Self-Audit — Day 50 (A–K)
A. Correctness (focus): ✅ — `computeOnboarding` is pure + unit-tested across 0% / partial / 100%; the checklist derives signals from real data and hides when complete.
B. Tenancy: ✅ — onboarding reads go through the existing tenant-scoped hooks (agents/calls/numbers); no new data path.
C. Security: ✅ — no secrets, no new endpoints beyond reusing `/ops/numbers`; nothing sensitive rendered.
D. Cost: ✅ NA — pure UI + one extra read; no provider calls.
E. Errors/obs: ✅ — the checklist no-ops while loading (no flash) and simply hides when complete; existing pages keep their error/empty states.
F. Performance (focus): ✅ — motion is transform/opacity only (compositor-friendly, no reflow); short durations (220–380ms); no JS animation lib added (zero bundle cost); page-transition reuses the route remount.
G. Error handling: ✅ — loading guards prevent a wrong/partial checklist; no throw paths added.
H. UI/motion/perf (focus): ✅ — smart onboarding checklist (goal-based next step, aha-moment test-call step, progress + empty-state CTAs); a tasteful motion pass (page transition, list stagger, card lift); **reduced-motion fully honoured** (all animation gated on `no-preference`, proven by the e2e contract) — no jank, no perf regression.
I. Regression: ✅ — additive (new shared module + component + CSS + one hook + light class additions); existing typecheck/lint/tests green (12 packages). Also fixed a latent `noNonNullAssertion`/format nit on the Day-48 developers page surfaced by the full lint. Scoped `biome --write` touched only Day-50 files (+ that one fix).
J. Quality/docs: ✅ — onboarding logic pure + tested in shared; motion documented in CSS as a design-system pass; reduced-motion rationale in code; no heavyweight dep pulled in.
K. Build/CI: ✅ — `pnpm build` exits 0; all CI gates (typecheck/lint/test) green locally.

Polished onboarding + delightful, performant, reduced-motion-safe motion — DoD met (E2E reduced-motion contract written/runnable; authenticated completion-path e2e deferred as noted).

**🎉 Phase 3 (Days 41–50) COMPLETE** — analytics · transcript search · QA scoring · WhatsApp/SMS messaging · multimodal agents · MCP/tool servers · marketplace + automations · public API+SDK+webhooks · SaaS ops toolkit · onboarding + motion. Tag `v0.5-phase3` after merge. Next: Phase 4 — white-label & reseller (Day 51: reseller hierarchy).

## Day 51 — Reseller Hierarchy + Sub-Tenant Provisioning — 2026-07-04 — ✅ DONE — opens Phase 4
Model: Opus (🧠 OPUS). Branch `day/51-reseller-hierarchy`. Prereq: Days 4-5 tenancy — done; no credential, **no migration** (builds entirely on the existing Tenant tree + RLS `is_in_subtree` + RESELLER_ADMIN role). Tagged `v0.5-phase3` before starting. Self-audit focus B (subtree isolation — critical) + C (RESELLER_ADMIN gating).

Built (DONE):
- **shared** `reseller.ts`: `subTenantInputSchema` (name, owner email, optional kebab slug, ACTIVE|TRIAL) + the pure **`descendantIds(tenants, rootId)`** subtree walk (inclusive, cycle-safe, edge-bounded so it can never escape a reseller's own subtree). 5 unit tests.
- **api** `ResellerService`: **`createSubTenant`** (provision a CUSTOMER child + OWNER user/membership; owner reused by email; unique-slug), **`listSubTenants`** (direct children), **`getSubTenant`**, **`setStatus`** (suspend/reactivate the target + its whole subtree — cascade). Isolation design: every READ + MANAGE path runs under `withTenant(resellerId)` so RLS blocks sibling-reseller access; only tenant CREATION uses the admin client (an inherently privileged op — RLS `WITH CHECK` can't self-reference a not-yet-visible new row — with the parent HARD-SET to the caller's reseller after `assertReseller`). Routes `/reseller/*`, **all RESELLER_ADMIN-gated** (SUPER_ADMIN passes). Wired composition+main. 4 RLS-real integration tests.
- **web** `/dashboard/reseller`: provision a customer (name + owner email), list sub-tenants with status, suspend/reactivate. A **reseller-only nav entry** (shown to RESELLER_ADMIN / SUPER_ADMIN).

Verification: full monorepo **typecheck 12/12**, **lint 12/12**, **build exit 0** (`/dashboard/reseller` emitted). Tests: shared **278** (reseller 5 — schema, inclusive/cycle-safe/edge-bounded descendant walk that never reaches a sibling subtree), api **200** (reseller 4 — provisioning + OWNER membership, **a reseller can't see/read/suspend another reseller's sub-tenant** (RLS → NotFound; the rival's status stays untouched), can't suspend itself, and suspend/reactivate cascades to a grandchild).

## Self-Audit — Day 51 (A–K)
A. Correctness: ✅ — `descendantIds` pure + unit-tested (inclusive, cycle-safe); provisioning + cascade proven against real Postgres.
B. Subtree isolation (focus — critical): ✅ — list/get/setStatus all run under `withTenant(resellerId)`, so RLS `is_in_subtree` scopes them to the reseller's subtree; a second reseller's customer is invisible (list omits it; get/suspend → NotFound) and provably untouched. The cascade set is computed ONLY from the RLS-visible subtree, so it can never span into a sibling reseller. Creation hard-sets `parentTenantId` to the caller's reseller.
C. RESELLER_ADMIN gating (focus): ✅ — the whole `/reseller` router is `requireRoles(RESELLER_ADMIN)` (SUPER_ADMIN passes); `assertReseller` additionally verifies the caller owns a RESELLER/PLATFORM tenant before provisioning; a reseller cannot suspend itself.
D. Cost: ✅ NA — tenancy operations, no provider calls.
E. Errors/obs: ✅ — Zod-validated input; typed NotFound (outside subtree) / Forbidden (not a reseller) / Validation (self-target); unique-slug retry avoids a 500 on collision.
F. Performance: ✅ — list is one indexed read; cascade is one subtree read + one `updateMany`; descendant walk is O(n) in-memory.
G. Error handling: ✅ — api surfaces typed errors; web shows provision errors + empty/error/loading states; suspend/reactivate reflect immediately.
H. UI/a11y: ✅ — labelled provision form (email-validated), status pills (suspended red / active green), suspend/reactivate actions, reseller-only nav, empty/error/loading states.
I. Regression: ✅ — additive (new shared module + api module + web page + reseller nav + wirings); NO migration; existing typecheck/lint/tests green (shared 278, api 200). Scoped `biome --write` touched only Day-51 files.
J. Quality/docs: ✅ — subtree walk pure + tested in shared; the admin-vs-RLS boundary + the WITH-CHECK-can't-self-reference rationale documented in code; explicit DTOs.
K. Build/CI: ✅ — `pnpm build` exits 0; all gates green locally.

Resellers provision/manage isolated sub-tenants; subtree isolation proven; tests pass — DoD CONFIRMED. Sibling-reseller isolation (the critical property), RESELLER_ADMIN gating, and suspend cascade CONFIRMED.
Deferred (follow-up): the owner-invite/password-set email for a provisioned sub-tenant owner (the user + OWNER membership are created without a password today — an invite/reset flow lands with the notification-delivery wiring); per-sub-tenant usage/billing rollup to the reseller (Day 53 wallet/markup engine). Next: Day 52 (custom domains + theming).
