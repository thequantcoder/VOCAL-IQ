# CODE-PATTERNS.md — Canonical Implementation Patterns

These are the copy-me patterns for the cross-cutting concerns that show up on almost every day. **Use them verbatim (adapted to context).** They exist so vibe-coding produces consistent, secure, correct code without re-deciding the hard parts each time. Pseudocode/representative TS — adapt to the real SDK versions in `TECH-STACK.md`, and always confirm a provider's real API by reading its docs (`CLAUDE.md §15`).

> If you deviate from a pattern, note why in `BUILD-LOG.md`.

---

## 1. Tenant-scoped data access (NEVER query without this)

Every query is scoped to the active tenant. Two layers: RLS (DB) + app guard (code).

```ts
// NestJS: resolve tenant from auth, set on the request DB session
@Injectable()
export class TenantGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const tenantId = await resolveTenantFromMembership(req.user, req.headers['x-tenant-id']);
    if (!tenantId) throw new TenantError('No active tenant');
    req.tenantId = tenantId;
    // set RLS context for this request's connection
    await req.db.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return true;
  }
}

// @CurrentTenant() decorator yields req.tenantId
// Repositories ALWAYS filter by it (defence in depth, even with RLS on):
const calls = await db.call.findMany({ where: { tenantId, status: 'COMPLETED' } });
```

**Rule:** if you write `findMany`/`findFirst`/`update`/`delete` without `tenantId` in the `where`, it's a bug — even if RLS would catch it.

---

## 2. Provider call through the router (NEVER call a provider directly)

```ts
// Always go through provider-router; always emit a UsageRecord.
const { client, meter } = await router.selectLLM({
  tenantId, agentId, capability: 'llm',
  language, costCeiling, latencyTarget, byok: tenantUsesOwnKey,
});

const result = await client.stream(messages, { onToken });

// meter() emits UsageRecord { provider, capability, units, costUsd, byok }
await meter({ units: result.tokens, /* costUsd computed from versioned price table */ });
```

- BYOK → `byok: true` → cost recorded informationally, **not billed**.
- Always set a timeout + a fallback provider in the router selection.
- The voice service uses the Python mirror with identical semantics.

---

## 3. Cost attribution (every call path must meter)

```ts
// Aggregate per-call usage into Call.costBreakdown in real time + on end.
await db.usageRecord.create({ data: { tenantId, callId, provider, capability, units, costUsd, byok, ts: new Date() }});
// On call end, roll up:
const breakdown = await aggregateCallCost(callId); // { stt, llm, tts, telephony, total }
await db.call.update({ where: { id: callId, tenantId }, data: { costBreakdown: breakdown }});
```
A reconciliation worker must find **zero** calls without usage records. If it finds one, that's a sev bug.

---

## 4. Webhook verification (Twilio / Stripe / SIP / WhatsApp)

```ts
// 1) verify signature, 2) check timestamp window, 3) dedupe replay via Redis nonce
export async function verifyWebhook(req, provider) {
  const sig = req.headers[provider.sigHeader];
  if (!provider.verify(req.rawBody, sig, provider.secret)) throw new AuthError('Bad signature');
  if (Math.abs(Date.now() - provider.timestamp(req)) > 5 * 60_000) throw new AuthError('Stale');
  const nonce = provider.id(req);
  if (!(await redis.set(`wh:${provider.name}:${nonce}`, '1', 'EX', 600, 'NX'))) throw new AuthError('Replay');
}
```
Use the **raw body** (not parsed) for signature checks. Never trust an unverified webhook.

---

## 5. Encrypted provider keys (envelope encryption, never plaintext)

```ts
// Store: encrypt with a KMS-derived data key. Decrypt only in memory at call time.
const { ciphertext } = await kms.encrypt(plainApiKey);        // store ciphertext bytes
await db.providerCredential.create({ data: { tenantId, provider, encryptedKey: ciphertext, byok }});
// Use:
const key = await kms.decrypt(cred.encryptedKey);             // in-memory only
// NEVER log `key`, never return it to the client, never put it in an error message.
```

---

## 6. Zod validation at every boundary

```ts
const CreateAgentDto = z.object({
  name: z.string().min(1).max(120),
  persona: z.string().max(20_000),
  languages: z.array(z.string()).min(1),
  turnTimeoutMs: z.number().int().min(500).max(5000),
});
// Parse at the edge; reject early with a safe message. Same idea with Pydantic in apps/voice.
```
Also validate env at boot (`parseEnv()` in `packages/shared`) and **fail fast** if a required key is missing.

---

## 7. RBAC enforcement (deny by default)

```ts
@Roles('OWNER', 'ADMIN', 'BUILDER')   // RolesGuard checks the membership role for the active tenant
@Post('agents')
create(@CurrentTenant() tenantId: string, @Body() dto: CreateAgentDto) { ... }
```
Sensitive reads and **every** mutation are role-gated. ANALYST/AGENT cannot mutate config. SUPER_ADMIN/RESELLER_ADMIN actions are also written to `AuditLog`.

---

## 8. The cross-tenant isolation test (extend it whenever you touch data)

```ts
it('tenant A cannot read tenant B data', async () => {
  const a = await seedTenant(); const b = await seedTenant();
  const bCall = await createCall(b.id);
  await setCurrentTenant(a.id);
  const rows = await db.call.findMany({ where: { id: bCall.id } }); // RLS + app filter
  expect(rows).toHaveLength(0);
});
it('reseller sees own child but not a sibling reseller subtree', async () => { /* ... */ });
```
This test runs in CI. New tenant tables/queries must be covered.

---

## 9. Real-time voice loop shape (Python / Pipecat)

```python
# Stream everything. Target TTFA < ~800ms.
pipeline = Pipeline([
    deepgram_stt(stream=True),         # partial transcripts ASAP
    context_manager,                   # injects RAG, memory, tools
    router_llm(stream=True),           # token streaming, tool-calling
    sentence_chunker,                  # chunk for low-latency TTS
    elevenlabs_tts(stream=True),       # first audio fast
    playback,
])
# Barge-in: on caller VAD during agent speech -> cancel in-flight TTS, flush, listen.
# Turn-taking: endpointing tuned by agent.turn_timeout_ms.
# Persist transcript segments live; emit events (node-active, partial, interruption) to clients.
# Attach per-component usage to the call (feeds cost engine).
```

---

## 10. Async jobs (BullMQ / Celery) — idempotent + observable

```ts
// Enqueue with a stable jobId for idempotency; tenant-namespaced.
await queue.add('transcribe', { tenantId, callId }, { jobId: `transcribe:${callId}`, attempts: 3, backoff: { type:'exponential', delay: 2000 }});
// Worker: validate, do one thing, emit metrics, handle failure -> DLQ + alert. Never swallow errors.
```

---

## 11. UI conventions (every async view)

```tsx
// Always handle the four states; use packages/ui + design tokens; dark mode + a11y + responsive.
if (isLoading) return <Skeleton />;
if (error)     return <ErrorState onRetry={refetch} />;
if (!data?.length) return <EmptyState cta="Create your first agent" />;
return <DataView data={data} />;
// No localStorage/sessionStorage for app state. Respect prefers-reduced-motion for Framer Motion.
```

---

## 12. New-table checklist (run this whenever you add a Prisma model)

1. Add `tenantId` (UUID, FK) + `@@index([tenantId])` (+ composite indexes for hot queries).
2. Add the RLS policy in `packages/db/rls/` (enable RLS + `tenant_isolation` + subtree fn).
3. Generate a migration named for the day (`dayNN_<thing>`).
4. Add/extend the cross-tenant isolation test.
5. If it stores secrets → envelope-encrypt (pattern #5). If PII → retention/redaction policy.
6. If time-series/usage → Timescale hypertable.

---

## 13. Error model usage

```ts
throw new ValidationError('Email already in use');       // -> 4xx, safe message to user
throw new ProviderError('TTS timeout', { cause: e });    // -> logged w/ context, generic msg to user
// Never leak internals/secrets in user-facing errors. Always report to Sentry with tenant/request/call ids.
```

---

Use these on every day. They are the difference between 95 features that *mostly* work and 95 features that are consistently secure, multi-tenant, metered, and correct.
