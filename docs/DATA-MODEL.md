# DATA-MODEL.md — Multi-Tenant Schema Reference

The authoritative schema is `packages/db/prisma/schema.prisma`. This file describes the entities, relationships, and the **non-negotiable tenancy + RLS rules** so Claude builds the schema correctly on Day 4 and extends it consistently thereafter.

> Rule: **every** tenant-owned table has `tenantId` + an index on it + an RLS policy. New tables added in later days must follow the same pattern. No exceptions.

---

## Core tenancy entities

### Tenant
The root of everything. Types: `PLATFORM` (singleton), `RESELLER`, `CUSTOMER`.
```
Tenant {
  id            UUID pk
  type          enum(PLATFORM, RESELLER, CUSTOMER)
  parentTenantId UUID? fk -> Tenant   // resellers own customers
  name          string
  slug          string unique
  status        enum(ACTIVE, SUSPENDED, TRIAL, CANCELLED)
  branding      Json   // logo, colors, fonts, favicon, emailFrom
  customDomain  string?
  settings      Json
  createdAt, updatedAt
}
```

### User & Membership (RBAC)
A user can belong to multiple tenants with a role per tenant.
```
User { id, email unique, name, authProviderId, mfaEnabled, createdAt }
Membership {
  id, userId fk, tenantId fk,
  role enum(SUPER_ADMIN, RESELLER_ADMIN, OWNER, ADMIN, BUILDER, ANALYST, AGENT, BILLING),
  status, createdAt
}
```
Roles & scope are defined in the blueprint §9; enforce in `api` guards.

### ApiKey (tenant + platform provider keys)
```
ProviderCredential {
  id, tenantId fk,            // null tenantId = platform-level key
  provider enum(OPENAI, ANTHROPIC, GEMINI, GROK, OPENROUTER, ELEVENLABS,
                PLAYHT, CARTESIA, DEEPGRAM, ASSEMBLYAI, TWILIO, TELNYX, LIVEKIT, ...),
  encryptedKey bytes,         // envelope-encrypted; NEVER plaintext
  byok boolean,               // true = tenant's own key
  meta Json, createdAt
}
PlatformApiKeyPool {          // load-balanced key pool (Section 4.5)
  id, provider, encryptedKey, weight, active, lastUsedAt
}
```

---

## Agents & flows

### Agent
```
Agent {
  id, tenantId fk, name, description,
  persona Json,               // system prompt, personality, guardrails, banned words
  defaultVoiceId fk?, fallbackVoiceId fk?,
  languages string[],         // multilingual config
  llmPolicy Json,             // model routing prefs, per-node overrides
  turnTimeoutMs int,          // configurable (Section 4.5)
  type enum(INBOUND, OUTBOUND, MIXED),
  status enum(DRAFT, PUBLISHED, ARCHIVED),
  memoryEnabled boolean,      // Agent Memory (Section 5.2.3)
  createdAt, updatedAt
}
```

### Flow / FlowVersion (React Flow graph)
```
Flow { id, tenantId, agentId fk, name, isActive }
FlowVersion {
  id, flowId fk, version int,
  graph Json,                 // nodes + edges (React Flow), node configs
  publishedAt, createdBy
}
```
Node types: Start, Say, Listen, Decision, Tool, Knowledge(RAG), Transfer, Collect&Confirm, End, Sub-flow, **Squad-handoff** (Section 5.2.1).

### Voice
```
Voice {
  id, tenantId? (null = public/preset),
  provider, providerVoiceId, name, language, gender, style,
  isCloned boolean, consentRef Json?,  // gated cloning consent
  settings Json   // stability, similarity, pace, pitch
}
```

### KnowledgeBase & chunks (RAG, pgvector)
```
KnowledgeBase { id, tenantId, agentId?, name, sourceType enum(PDF,DOC,TXT,URL,TEXT) }
KbChunk { id, kbId fk, tenantId, content, embedding vector(1536), metadata Json }
```

### AgentMemory (cross-call)
```
AgentMemory {
  id, tenantId, agentId, contactId fk,
  summary text, facts Json, lastCallId fk?, updatedAt
}  // retention + privacy controlled per tenant
```

---

## Leads, contacts & pipeline (Section 4.1)

```
Contact {
  id, tenantId, phone, name, email,
  fields Json,                 // custom fields
  tags string[], source, dnc boolean, kycStatus
}
Lead {
  id, tenantId, contactId fk,
  status enum(NEW, CONTACTED, QUALIFIED, HOT, WARM, COLD, BOOKED, LOST),
  score int, owner fk?, pipelineStage, dynamicVars Json
}
```

---

## Telephony & calls

```
PhoneNumber {
  id, tenantId?, provider, e164, capabilities, assignedAgentId fk?,
  kycVerified boolean, source enum(POOL, PURCHASED, SIP)
}
SipTrunk {                     // BYO-SIP (Section 4.3)
  id, tenantId, providerTemplate, encryptedCreds bytes, transport(TLS),
  inbound boolean, outbound boolean, concurrencyLimit int
}
Call {
  id, tenantId, agentId, flowVersionId, contactId?,
  direction enum(INBOUND, OUTBOUND), channel enum(PSTN, WEB, SIP),
  status enum(QUEUED, RINGING, IN_PROGRESS, COMPLETED, FAILED, VOICEMAIL, NO_ANSWER),
  startedAt, endedAt, durationSec,
  recordingUrl, disposition, sentiment,
  costBreakdown Json,          // {stt, llm, tts, telephony, total} per Section 3.7
  transcriptId fk?
}
Transcript { id, callId fk, tenantId, segments Json, summary text, keywords string[] }
```

---

## Campaigns (Section 3.6)

```
Campaign {
  id, tenantId, name, agentId,
  status, scheduleJson, pacing, concurrency, retryPolicy Json,
  channelMix Json   // voice + WhatsApp/SMS (Section 4.4)
}
CampaignContact { id, campaignId fk, contactId fk, status, attempts, lastCallId fk? }
```

---

## Appointments (Section 4.6)

```
Appointment {
  id, tenantId, contactId, callId?,
  startsAt, endsAt, status enum(BOOKED, RESCHEDULED, CANCELLED, COMPLETED),
  calendarProvider, externalEventId   // Google Calendar two-way sync
}
```

---

## Billing & metering (Section 11)

```
Plan {                         // built in no-code plan builder (super-admin/reseller)
  id, tenantId? (null=platform/global), name, priceMonthly, currency,
  includedMinutes, agentLimit, numberLimit, sipLimit, features Json,
  overageRatePerMin, isResellerPlan boolean
}
Subscription { id, tenantId, planId, status, processor, externalId, currentPeriodEnd }
Wallet { id, tenantId, balanceCents, autoRecharge Json }
UsageRecord {                  // one per metered provider call
  id, tenantId, callId?, provider, capability, units, costUsd, byok, ts
}
Invoice { id, tenantId, period, lineItems Json, total, status, processor }
ResellerMargin { id, resellerTenantId, childTenantId, period, revenue, cost, margin }
```

---

## Ops, integrations, audit

```
Integration { id, tenantId, type(HUBSPOT, SALESFORCE, ZENDESK, GOOGLE, ZAPIER, WEBHOOK, ...), config Json (encrypted secrets) }
Webhook { id, tenantId, url, events string[], secret (encrypted), active }
SupportTicket { id, tenantId, subject, body, status, priority, assignee }  // Section 4.7
Notification { id, tenantId, userId?, channel, payload, readAt }
AuditLog { id, tenantId, actorUserId, action, target, meta Json, ts }  // privileged actions
FeatureFlag { id, scope(GLOBAL|PLAN|TENANT), key, value, tenantId? }
AgentPresence { id, tenantId, userId, status enum(AVAILABLE, BUSY, AWAY, OFFLINE), skills string[], updatedAt }  // Agent Desk (Day 67)
CallQueueEntry { id, tenantId, callId fk, reason enum(TRANSFER, ESCALATION), claimedBy fk?, waitStartedAt, status }  // Agent Desk routing

// ---- Phase 6 / core-tier additions (Days 69-94) ----
NumberReputation { id, tenantId, phoneNumberId fk, score, spamLabel, attestationLevel, history Json, lastCheckedAt }  // Day 69
AbuseSignal { id, tenantId, type, score, detail Json, action enum(NONE,THROTTLE,PAUSE,SUSPEND,KILL), ts }  // Day 70
DisclosureLog { id, tenantId, callId fk, region, disclosedText, optOutOffered boolean, ts }  // Day 71
ConversationInsight { id, tenantId, callId fk, type enum(OBJECTION,BUYING_SIGNAL,COMPETITOR,FEATURE_REQ,CHURN), value, confidence }  // Day 75
Outcome { id, tenantId, callId fk, leadId fk?, type enum(QUALIFIED_LEAD,BOOKING,PAYMENT,WON), value, verified boolean, revenueAmount }  // Days 81-82
MarketplaceListing { id, sellerTenantId, kind enum(AGENT_TEMPLATE,APP,CONNECTOR), priceModel Json, status, ratings Json }  // Days 83-84
MarketplacePurchase { id, buyerTenantId, listingId fk, pricePaid, payoutToSeller, platformCut, ts }  // Days 83-84
Automation { id, tenantId, name, graph Json, status, runStats Json }  // Day 85 workflow builder
AutomationRun { id, tenantId, automationId fk, status, steps Json, startedAt, endedAt }  // Day 85
Voiceprint { id, tenantId, contactId fk, encryptedTemplate bytes, consentRef Json, region, createdAt }  // Day 91 (biometric — special-category data)
AvatarConfig { id, tenantId, agentId fk, provider, avatarId, likenessConsentRef Json }  // Day 92
CopilotSession { id, tenantId, userId, callId fk?, suggestions Json, ts }  // Days 74, 90
```

---

## RLS strategy (apply alongside Prisma migrations)

For every tenant table:
```sql
ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "<table>"
  USING ("tenantId" = current_setting('app.current_tenant')::uuid
         OR is_in_subtree("tenantId", current_setting('app.current_tenant')::uuid));
```
- `app.current_tenant` is set per connection/request by the API and the voice service.
- Reseller subtree access via an `is_in_subtree()` SQL function (reseller can see descendants).
- Platform/super-admin uses a privileged role that bypasses RLS **only** through audited admin endpoints.
- Add an automated test on Day 5 that proves cross-tenant reads return zero rows.

---

## Indexing & performance notes

- Index every `tenantId`; composite indexes on hot query paths (`(tenantId, status)`, `(tenantId, createdAt)`).
- Timescale hypertables for `UsageRecord` and call-metric tables.
- pgvector IVFFlat/HNSW index on `KbChunk.embedding`.
- Use cursor pagination on large lists (calls, leads, transcripts).
