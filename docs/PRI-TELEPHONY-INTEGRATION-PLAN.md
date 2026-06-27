# PRI Telephony Integration — Plan of Action (Optional / Backup Path)

> **Status:** PLANNED — not started. Execute **after all super-prompts (Days 00–94) are complete**.
> **Nature:** Always **optional**, behind a feature flag (`PlanFeature.PRI_TELEPHONY`). The multi-tenant SaaS default stays **SIP-first**; PRI is an **enterprise / on-prem / backup** option.
> **Owner doc:** this file is the single source of truth for the PRI work-package. Keep it in sync if scope changes.
> **Related:** `ARCHITECTURE.md` (router, realtime transport), `DATA-MODEL.md` (`SipTrunk`, `Call`, `UsageRecord`), `CODE-PATTERNS.md` (§1 tenancy, §3 cost, §5 encrypted keys), super-prompts Day 35 (SIP), Day 61 (on-prem/VPC), Day 69–71 (caller reputation / fraud / AI disclosure), Day 13 (cost attribution).

---

## 0. Guiding principle (read first)

**PRI is consumed as SIP.** A PRI (E1 in India ≈ 30 channels, T1 in NA ≈ 23) is a TDM circuit that terminates on **physical hardware**; VocalIQ's cloud/voice pipeline speaks **SIP/IP**. So PRI is **never** integrated as a new protocol in our code — it is always bridged to SIP by an **SBC / media gateway** (AudioCodes, Patton, Sangoma, or Asterisk/FreeSWITCH with a PRI card):

```
PSTN ──▶ Carrier PRI (E1/T1) ──▶ SBC / gateway (PRI↔SIP) ──▶ SIP ──▶ LiveKit SIP / on-prem VocalIQ ──▶ Agent loop
```

**Consequence:** 95% of this plan is *trunk management, failover, capacity, dashboard, and ops* on top of our existing **SIP `TelephonyProvider`** — not a new media path. The PRI↔SIP conversion is the **gateway's** job (carrier/customer infra), not ours. This keeps the blast radius small and the platform cloud-native.

**Three reasons PRI exists in VocalIQ:**
1. **On-prem / data-residency** (Day 61) — regulated customers (bank/govt/healthcare in India) whose call audio must not leave their premises; PRI + local SBC + on-prem VocalIQ.
2. **Backup / failover** — a dedicated circuit that takes over when the primary SIP carrier or internet path degrades (the "always a backup" goal).
3. **Bring-your-own-PRI / dedicated capacity** — enterprises with existing PRI contracts, steady high volume, or QoS/compliance mandates.

---

## 1. Scope & non-goals

**In scope**
- Model + manage **PRI-backed trunks** (a `SipTrunk` whose upstream is an SBC fronting a PRI).
- **Trunk groups with primary→backup failover** (SIP primary ⇄ PRI backup, or PRI primary ⇄ SIP backup).
- **Health checks + circuit-breaker** routing (channel exhaustion, registration loss, internet/SIP outage).
- **Frontend** (tenant): add/configure/test a PRI gateway trunk; capacity + health UI; primary/backup ordering.
- **Admin/reseller dashboard**: platform trunk pool, per-tenant assignment, utilization, failover events, cost.
- **Cost model** for fixed-circuit pricing (monthly + per-channel) reconciled into the per-call cost engine.
- **On-prem deployment** recipe (Day 61) using PRI + local SBC.
- **Compliance** hooks (India TRAI/DoT, DLT, AI disclosure) specific to PRI/carrier origination.

**Non-goals**
- Implementing PRI/ISDN/TDM signalling in our code (the SBC does this).
- Shipping/operating SBC hardware ourselves for the *cloud* product (customer/carrier owns it; we may provide a reference SBC config + a managed-SBC partner option).
- Replacing SIP as the platform default.

---

## 2. Architecture

### 2.1 Cloud SaaS (PRI as failover backup for a tenant)
```
                     ┌─ primary ─▶ Carrier SIP trunk ───────────────┐
Tenant outbound ▶ Router.selectTelephony (trunk group, health-aware)│─▶ LiveKit SIP ─▶ Agent
                     └─ backup  ─▶ Carrier PRI ─▶ SBC ─▶ SIP ───────┘
Inbound: PSTN ▶ (SIP trunk) or (PRI ▶ SBC ▶ SIP) ▶ LiveKit SIP ▶ dispatch to agent room
```

### 2.2 On-prem / data-residency (Day 61)
```
On-prem PSTN ─ PRI ─▶ on-prem SBC ─ SIP ─▶ on-prem VocalIQ (voice + workers + DB in customer VPC)
                                              (no audio leaves the premises)
```

### 2.3 Component mapping (what already exists vs new)
| Concern | Exists | New for PRI |
|---|---|---|
| Telephony abstraction | `TelephonyProvider` (provider-router) | a `GenericSIP` adapter usable by any SBC-fronted trunk |
| Per-tenant trunk creds | `SipTrunk` (encrypted) | + `kind`, `sbcHost`, `channels`, `failover` fields; `TrunkGroup` |
| Call routing | `Router.selectTelephony` | health-aware + failover trunk selection |
| Cost | `UsageRecord`, cost engine (Day 13) | fixed-circuit amortization + per-channel |
| Media bridge | LiveKit SIP | inbound/outbound SIP trunk config per trunk |
| On-prem | Day 61 (VPC/residency) | SBC-in-VPC recipe |

---

## 3. Backend plan

### 3.1 Data model (Prisma additions — new migration, follow `CODE-PATTERNS.md §12`)
Extend `SipTrunk` and add a `TrunkGroup` for primary/backup ordering. Every table stays tenant-scoped + RLS.

```prisma
enum TrunkKind { SIP PRI_GATEWAY }          // PRI_GATEWAY = SBC fronting a PRI circuit
enum TrunkHealth { UNKNOWN HEALTHY DEGRADED DOWN }
enum TrunkRole { PRIMARY BACKUP OVERFLOW }

model SipTrunk {                              // EXTEND the existing model
  // ...existing: id, tenantId, providerTemplate, encryptedCreds, transport, inbound, outbound, concurrencyLimit
  kind            TrunkKind   @default(SIP)
  sbcHost         String?                     // SBC/gateway hostname or IP (PRI_GATEWAY)
  sbcPort         Int?        @default(5061)
  authMode        String      @default("DIGEST")  // DIGEST | IP_ACL
  channels        Int?                        // PRI capacity (E1≈30 / T1≈23); null for elastic SIP
  health          TrunkHealth @default(UNKNOWN)
  lastHealthAt    DateTime?
  monthlyCostCents Int?       @default(0)      // fixed circuit cost (PRI) for amortization
  trunkGroupId    String?     @db.Uuid
  role            TrunkRole   @default(PRIMARY)
  priority        Int         @default(100)    // lower = tried first within a group
  enabled         Boolean     @default(true)
}

model TrunkGroup {                             // ordered failover set for a tenant
  id          String     @id @default(uuid()) @db.Uuid
  tenantId    String     @db.Uuid
  name        String
  strategy    String     @default("FAILOVER")  // FAILOVER | LEAST_COST | ROUND_ROBIN
  trunks      SipTrunk[]
  // @@index([tenantId]) + RLS tenant_isolation (new-table checklist)
}
```
- Migration: `dayNN_pri_trunks` + matching RLS in `packages/db/rls/`.
- Reuse envelope encryption (Day 57 KMS) for `encryptedCreds` — PRI/SBC creds are never plaintext, never in env (per-tenant → DB only).

### 3.2 Provider-router: health-aware trunk selection + failover
- New **`GenericSIPTelephony`** adapter (`packages/provider-router/src/adapters/sip.ts`) — places/receives calls via a SIP trunk (works for any carrier SIP *or* PRI-via-SBC; the trunk's `kind` is metadata, the wire is SIP through LiveKit SIP).
- Extend `Router.selectTelephony(req)` to:
  1. Load the tenant's `TrunkGroup` (or platform default).
  2. Order candidates by `strategy` (FAILOVER → role/priority; LEAST_COST → cost; ROUND_ROBIN).
  3. Skip trunks that are `DOWN` or at channel capacity (`channels` vs live concurrent count from Redis).
  4. On dial failure / SIP error → **fall to the next trunk** (mirrors the LLM fallback pattern already built).
- **Health checks** (workers, BullMQ, tenant-namespaced): periodic SIP `OPTIONS` ping / registration probe → update `SipTrunk.health` + `lastHealthAt`; circuit-breaker opens on consecutive failures, half-open retry. Surface `AbuseSignal`-style events for `DOWN` transitions.
- **Capacity tracking:** per-trunk concurrent-call counter in Redis (tenant-scoped key); enforce `channels` on PRI trunks (hard cap) so a full E1 overflows to backup.

### 3.3 Cost attribution (Day 13 cost engine integration)
- SIP/per-minute trunks: cost as today (per-minute rate × seconds → `UsageRecord` capability `telephony`).
- **PRI fixed-circuit:** model as `monthlyCostCents` amortized — a worker writes a periodic synthetic `UsageRecord`/cost rollup attributing the circuit cost across the period's calls (or a flat monthly line item in `Invoice`). Keep per-call `UsageRecord` for minutes (units = seconds) with `costUsd = 0` for the metered minute when the circuit is flat, plus the amortized line — clearly flagged so margin math stays correct. Document the chosen approach in `BUILD-LOG.md` when implemented.
- Reseller margin (`ResellerMargin`) accounts for both per-minute and amortized models.

### 3.4 LiveKit SIP wiring
- For each enabled trunk, create LiveKit **inbound + outbound SIP trunk** config pointing at the trunk's SBC/carrier host with its auth (digest creds or IP-ACL). Store the LiveKit trunk id on `SipTrunk.meta`.
- Inbound dispatch rule → routes the DID to a LiveKit room → the agent joins (existing Day 9 loop).

### 3.5 Security & compliance
- TLS + SRTP required where the carrier/SBC supports it; record per-trunk transport.
- IP-ACL mode: maintain the platform's egress IP allowlist; document for carrier whitelisting.
- **India regulatory** (PRI origination): TRAI/DoT outbound rules, **DLT** (if SMS), and **AI disclosure** (Day 71) enforced on PRI calls the same as SIP. KYC docs tracked per trunk (`meta`).
- Caller-ID / CNAM + STIR-SHAKEN (Day 69) — note PRI origination CLI rules differ by carrier.

### 3.6 Observability
- Metrics: per-trunk health, channel utilization %, failover count, ASR/ACD per trunk, cost per minute.
- Alerts: trunk `DOWN`, capacity > 80%, failover storms.
- AuditLog entries for trunk create/update/enable/disable + failover events (privileged).

---

## 4. Frontend plan (tenant dashboard — `apps/web`)

All screens follow `DESIGN-SYSTEM.md` (four states, a11y AA, dark+light, tenant white-label tokens) and use `packages/ui`.

### 4.1 Settings → "Phone numbers & Trunks"
- **Trunk list**: name, `kind` badge (SIP / PRI-gateway), health pill (green/amber/red — never colour-only; pair with icon+label), channels used/total, role (Primary/Backup), enabled toggle.
- **Add trunk** wizard:
  1. Choose type: **SIP carrier** or **PRI via gateway (SBC)**.
  2. Enter SBC/carrier host + port, transport, auth (digest creds **masked**, or IP-ACL → show *our* IPs to whitelist).
  3. DIDs + outbound CLI; channels (PRI capacity).
  4. **Test connection** (calls a backend probe → OPTIONS/registration) with live result; never save creds that fail format validation (Zod).
- **Trunk group / failover order**: drag-to-reorder primary → backup → overflow; pick strategy (Failover / Least-cost / Round-robin). Visualize the failover chain.
- Autosave with a clear saved indicator; confirmations for disable/delete (with undo where safe).

### 4.2 Live status surface
- Real-time (Socket.IO) trunk health + channel utilization tiles (cyan pulse on live updates per design system).
- Recent **failover events** timeline.
- Empty/loading/error states designed (skeletons, not spinners); empty state teaches ("Add your first trunk or use the platform default").

### 4.3 Copy & guardrails
- Plain-language help (`?` tooltips) explaining SIP vs PRI, what an SBC is, what to ask the carrier (link a short version of §"what to get from the carrier").
- PRI-gateway trunks show an "on-prem capable" hint where relevant.

---

## 5. Admin / reseller dashboard

### 5.1 Super-admin (platform)
- **Trunk pool**: all platform trunks, health, utilization, cost; assign a platform-default trunk group.
- **Per-tenant view**: which trunks/groups a tenant uses; force-assign or override; capacity planning across an E1's fixed channels.
- **Failover analytics**: failover frequency, trunk reliability ranking, cost-per-trunk; alerts feed.
- All cross-tenant actions via the **privileged (RLS-bypass) audited path** → `AuditLog`.

### 5.2 Reseller (scoped to subtree)
- Assign trunks/groups to sub-tenants (reseller can BYO a Tata trunk for its customers); markup applies via `ResellerMargin`.
- Reseller sees only its subtree (RLS subtree enforcement — already built Day 5).

### 5.3 Scope indicator
- Persistent platform → reseller → customer scope indicator (per `DESIGN-SYSTEM.md §5e`) so admins always know "where" a trunk change applies.

---

## 6. Multi-tenancy, feature flag, deployment

- **Feature flag** `PlanFeature.PRI_TELEPHONY` (and `FeatureFlag` scope GLOBAL/PLAN/TENANT) gates all UI + endpoints → PRI is **always optional**, enabled per plan/tenant.
- Trunks are tenant-scoped (`SipTrunk.tenantId` + RLS); a platform-default trunk group has `tenantId = null` (platform), visible per the nullable-tenant RLS policy.
- **On-prem (Day 61):** deployment recipe = customer VPC running voice+workers+DB, an in-VPC SBC bridging their PRI, LiveKit (self-host or LiveKit-in-VPC), no audio egress. Document residency guarantees.

---

## 7. Phased plan of action (work packages — run after Day 94)

> Each WP = build → tests (mocked + a lab/sandbox smoke) → self-audit (A–K) → commit → push → PR → CI green → merge. Live SBC tests are key/lab-gated so CI stays green (mirrors the Day-6/7 live-test pattern).

| WP | Title | Depends on | Deliverables |
|----|-------|-----------|--------------|
| **WP1** | Data model + RLS | Day 4/5 schema | `SipTrunk` extensions, `TrunkGroup`, migration + RLS + isolation tests |
| **WP2** | GenericSIP telephony adapter | Day 7 SIP scaffold, Day 35 SIP | `sip.ts` adapter (dial/answer/transfer/hangup via LiveKit SIP) + contract tests |
| **WP3** | Trunk selection + failover + health | WP1–2, Day 7 router | `Router.selectTelephony` group/health-aware selection, circuit-breaker, BullMQ health worker, Redis capacity counter + tests |
| **WP4** | Cost model | WP1, Day 13 cost engine | fixed-circuit amortization + per-minute, reseller margin, reconciliation worker + tests |
| **WP5** | Backend API + RBAC | WP1–4, Day 5 RBAC | CRUD trunks/groups, test-connection probe, role-gated (OWNER/ADMIN), AuditLog; Zod DTOs |
| **WP6** | Tenant frontend | WP5, Day 14 dashboard, design system | Trunks settings, add-wizard, failover ordering, live status, four states, a11y |
| **WP7** | Admin/reseller dashboard | WP5–6, Day 54/55 | platform pool, per-tenant assignment, failover analytics, scope indicator |
| **WP8** | Compliance + caller-ID | WP3, Day 69–71 | TRAI/DoT/DLT hooks, AI disclosure on PRI calls, CLI/CNAM/STIR config |
| **WP9** | On-prem recipe | WP1–8, Day 61 | VPC + in-VPC SBC deployment guide, residency validation |
| **WP10** | Observability + docs | all | metrics/alerts dashboards, runbook, BUILD-LOG entries, this doc finalized |

**Suggested sequence:** WP1 → WP2 → WP3 → WP4 → WP5 → WP6 → WP7 → WP8 → WP9 → WP10. WP1–3 deliver the **backup/failover** capability (the core ask); WP6–7 make it usable; WP8–9 cover enterprise/India needs.

---

## 8. Testing & acceptance

- **Unit/mocked:** trunk selection ordering, failover on simulated dial failure, capacity-exhaustion overflow, cost math (per-minute + amortized), health-state transitions.
- **Integration:** RLS isolation for trunks/groups (tenant A can't see B's trunk creds); RBAC (ANALYST can't mutate trunks).
- **Lab/sandbox smokes (gated):** against a test SBC (Asterisk/FreeSWITCH with a simulated PRI or a carrier test trunk) — place/receive a call; force primary down → verify backup takes over; verify creds never logged.
- **Acceptance (DoD):**
  - [ ] A tenant can add a PRI-gateway trunk + a SIP trunk and order them primary/backup.
  - [ ] Primary outage (health DOWN or channels full) → calls route to backup automatically.
  - [ ] Per-call `UsageRecord` emitted; fixed-circuit cost amortized correctly.
  - [ ] All trunk creds encrypted at rest; RLS + RBAC enforced; AuditLog on changes.
  - [ ] Feature flag off → PRI UI/endpoints hidden; SIP-only behaviour unchanged.
  - [ ] On-prem recipe validated: no audio egress.

---

## 9. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Treating PRI as a new protocol in code | Hard rule: PRI is always SIP-via-SBC; no TDM in our stack |
| Fixed-circuit cost distorts margin | Explicit amortization model + reconciliation worker; document in BUILD-LOG |
| Failover loops / flapping | Circuit-breaker with half-open + cooldown; alert on failover storms |
| Carrier IP-ACL drift (our egress IPs change) | Pin/announce egress IPs; prefer digest+TLS where possible; doc for carrier |
| India compliance (AI calling, DLT, KYC) | WP8 ties to Day 71 disclosure + per-trunk KYC tracking; legal review before live |
| On-prem support burden | Provide a reference SBC config + managed-SBC partner option; scope to enterprise tier |

---

## 10. What to request from the carrier (PRI + SBC) — checklist
(For provisioning; mirrors the SIP checklist plus PRI specifics.)
1. **SIP trunking** delivered by the carrier's SBC (request SIP, not raw PRI, unless on-prem with your own SBC).
2. If on-prem PRI: the **E1/T1 circuit** + your **SBC/gateway** (vendor, PRI card, SIP-side config).
3. SBC host/IP + port (5060/5061), transport (TLS), codecs (G.711 a-law for India, Opus).
4. Auth: **digest creds** or **IP-ACL** (which IPs to whitelist).
5. DIDs, inbound routing to your SIP endpoint, allowed outbound **CLI**.
6. **Channel capacity** (E1 ≈ 30), DTMF method (RFC2833/SIP INFO).
7. **KYC + regulatory**: business verification, TRAI/DoT outbound rules, DLT (SMS), AI/automated-call restrictions.

---

## 11. Decision log
- **2026-06-27:** Decided PRI will be supported as an **optional, feature-flagged backup/enterprise path**, consumed as SIP via an SBC — **not** as a new protocol. Platform default remains SIP-first. Execution deferred until after all super-prompts (Days 00–94). This document is the plan of record.
