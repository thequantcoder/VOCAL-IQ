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
