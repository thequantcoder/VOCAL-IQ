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
