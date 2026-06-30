# Competitor Feature Analysis & Gap Map — IntelliCall AI + AgentLabs AI

> **Purpose:** capture the **complete** feature sets of two CodeCanyon voice-agent products as a reference, then **tally against VocalIQ's plan** (Days 00–94) to find what we DON'T have and should incorporate — while keeping all of our own planned features. Goal: make VocalIQ a strict superset.
> **Sources (analysed 2026-06-30):**
> - IntelliCall AI — https://codecanyon.net/item/intellicall-ai-ai-voice-calling-agents-for-lead-campaign-automation/61664541
> - AgentLabs AI — https://codecanyon.net/item/agentlabs-ai-voice-calling-agents-lead-intelligence-saas-platform/60751656
> **Note:** extracted from page **text/descriptions** (image-only claims may not be captured). Re-verify before building any specific behaviour. VocalIQ day numbers reference `CLAUDE.md §11` / `PROMPT-INDEX.md`.

---

## Part 1 — IntelliCall AI: full feature list (verbatim-grouped)

**Voice & AI stack:** ElevenLabs TTS · Deepgram STT · OpenRouter LLM (OpenAI/Anthropic/others) · unlimited agent personas · 15+ language voices (EN/AR/FR/HI/DE/ES/NL/HE/IT/JA/KO/PT/RU/TA/UR) · auto language detection · low-latency · interruption (barge-in) handling.
**Agent builder:** ready-made templates (sales/support/scheduling/healthcare) · pre-filled system prompts + opening messages · brand voice · multi-agent dashboard · multi-language templates.
**Lead management:** central workspace, custom fields, tags, status, dynamic variables, scoring, auto-qualification, "hot leads" surfacing, CSV/Google-Sheets import, phone-based dedupe.
**Campaigns (outbound):** bulk dialing, scheduling, auto-run, Google-Sheets real-time sync, multi-number assignment, hang-up/runaway-duration limits, performance analytics.
**Inbound:** per-number flows, inbound routing/assignment, direction filtering.
**Appointments:** book from live calls, Google Calendar real-time sync, edit (date/time/duration/notes), cancellation sync, reschedule-safe reminders.
**Knowledge base:** RAG grounding, FAQ/business context, website-URL import, on-brand/factual answers.
**Call intelligence:** recording + player, live transcripts, auto summaries, post-call analysis, lead scoring from content, transcript search.
**Integrations (per-user, native):** WhatsApp (Meta Cloud API, approved templates, timezone-aware reminders, configurable lead time, per-event toggles, test buttons) · Slack (one-click add, per-event notifications, channel select) · HubSpot CRM (phone upsert) · Google Calendar · Google Sheets (column mapping, auto-pull) · **n8n (400+ apps, 3 importable workflow templates incl. instant-dial + form-to-call)** · Twilio · SIP trunks (Asterisk) · payments: Stripe/PayPal/Razorpay/Dodo · AI BYOK: OpenRouter/ElevenLabs/Deepgram/Twilio Voice.
**API/extensibility:** personal API keys (hashed, shown once, revocable) · in-dashboard API reference w/ copy-ready curl · **instant AI call endpoint `POST /api/calls/dial` (auto-creates lead)** · 12 documented endpoints · webhooks w/ **HMAC-SHA256 signed payloads** + per-event toggles · REST from n8n/Zapier/scripts.
**SaaS/multi-tenant:** self-host as your product, own branding, BYOK, white-label (extended license), per-user credential isolation, per-user OAuth tokens.
**Admin/billing:** plans/limits/tiers (agents/campaigns/leads/monthly-call caps), subscription revenue via gateways, configurable trials, **support-ticket system**, Admin→Integrations OAuth credential panel, **"Check for Updates"** version checker.
**Branding:** app name, primary color, logo, favicon, landing branding, dark mode, contact/social/HQ.
**Auth/security:** Google OAuth 2.0 + email/password, RBAC (admin/member), per-user creds, token API, HMAC webhooks, Passport.js + JWT.
**Dashboard/UX:** modern dashboard, dark mode, responsive, redesigned Integrations tab w/ live connection status, agents drawer, appointments edit, leads filters/tags/custom fields.
**Analytics:** call analytics, campaign performance, conversion reporting, agent summaries, direction stats, completion reports.
**Email/notifications:** per-event email toggles (lead/call/appointment).
**Tech stack:** Node/Express 5 · Next.js 16/React 19/Tailwind · Twilio WebSockets bidirectional media · MongoDB · Passport.js · VPS installer + one-click updates.

---

## Part 2 — AgentLabs AI: full feature list (verbatim-grouped)

**Voice & AI:** AI voice-agent creation w/ personalities · ElevenLabs + OpenAI voice · multi-language · NLP (OpenAI) · voice personality (friendly/formal/energetic/casual) · **stability/similarity settings** · **temperature controls** · **V3 TTS model** · turn-timeout config (0.5–5.0s) · naturalness settings · dynamic variables.
**Bulk calling/campaigns:** CSV import (thousands) · **concurrent/simultaneous calling at scale** · smart scheduling (preferred time ranges) · **queue management (pending/processing/completed/failed states)** · unlimited campaigns · campaign→integration filtering/routing · **per-campaign retry logic** · call distribution / load balancing.
**Knowledge base:** PDF/DOC/TXT upload · URL training · custom text articles · RAG · KB management UI.
**Analytics/monitoring:** real-time dashboard · success metrics (completion/connection/drop-off) · **lead qualification scoring Hot/Warm/Cold** · **sentiment analysis (pos/neu/neg)** · duration metrics · **weekly/monthly trend reports** · CSV/PDF export · execution logs.
**Recording/transcription:** auto-record · AI transcription · **keyword extraction** · summaries · searchable history · audio player · recording management.
**Workflow/automation:** **visual Flow Builder** · dynamic response logic (AI reacts to answers) · webhooks · CRM webhook compat · custom endpoints · flow templates · appointment booking in-call · post-call actions/triggers.
**Contact/lead:** contact mgmt + segmentation · universal DB · lead scoring · filtering · bulk ops · import/export.
**Forms & data collection:** **AI Form Builder (dynamic forms within flows)** · **form routing to endpoints** · Google Sheets sync · field validation · **auto header-row creation**.
**Multi-channel:** WhatsApp (templates) · post-call messaging · message templates · template variables · **language-based message routing**.
**Telephony:** Twilio · **Plivo** · ElevenLabs/OpenAI voice · SIP trunk (inbound + outbound, credential validation, transport config, access controls, transcripts/summaries for SIP) · **phone-number purchase/pool + availability filtering**.
**Payments:** Stripe/PayPal/Razorpay/Paystack/MercadoPago · **credit-based per-minute billing** · Free/Pro plans · **bonus/promotional credits** · membership controls.
**Admin dashboard:** user/role mgmt · subscription control · **credit-package mgmt** · phone-number pool mgmt · **ElevenLabs API-key pool (load-balanced)** · global analytics · call-queue monitoring · **broadcast/platform-wide notifications** · platform settings.
**User dashboard:** campaign dashboard · analytics portal · billing/subscriptions · credit mgmt · number purchasing · webhook config · **website call widget mgmt** · **Quick CRM**.
**API/developer:** REST API · API-key mgmt · webhook triggers (call-complete/responses/forms) · campaign/agent/call-record APIs · **API pagination** · signed webhooks · **replay-attack protection (timestamp)** · base-URL detection.
**Google Calendar:** OAuth 2.0 · bi-directional sync · booking automation · reschedule/cancel sync · completion tracking.
**Security:** SSL/TLS · RBAC · encrypted API keys · SQLi protection · password hashing · CORS · raw-body webhook verification · replay prevention · **rate limiting** · input sanitisation (XSS) · SAST compliance.
**i18n:** multi-language · per-agent language · **built-in content translation** · cultural adaptation · language resolution.
**UI:** dark mode · responsive · charts · real-time updates · advanced search · bulk actions · CSV/PDF export · sidebar nav · tabs · status indicators.
**Tech stack:** Node 18+/Express · **PostgreSQL 14+ / Drizzle ORM** · PM2 · React/Vite/Tailwind · Nginx · self-host installer.
**Licensing:** Regular $89 / Extended $499 / +12mo support.

---

## Part 3 — Gap map vs VocalIQ (the important part)

Legend: ✅ **already in our plan** (Day) · 🔼 **partially covered — enhance** · ➕ **NEW — add**

| Feature (from them) | VocalIQ status | Where / action |
|---|---|---|
| ElevenLabs TTS / Deepgram STT / LLM via OpenRouter+OpenAI+Anthropic | ✅ | Provider-router Days 6–7; add **OpenRouter** adapter (Group C) |
| Multi-language voices + auto language detection + barge-in | ✅ | Days 25 (multilingual), 9 (barge-in), 68 (i18n) |
| Agent templates (sales/support/scheduling/healthcare) + prefilled prompts | ✅ | Day 24 persona/templates |
| Visual flow/agent builder (React Flow) | ✅ (we exceed) | Days 17–23 node builder + compiler + test panel |
| Voice personality + stability/similarity/temperature + turn-timeout + V3 model | ✅ | Days 24/26 (persona, voice settings); persona JSON + `turnTimeoutMs` already in schema |
| Lead workspace: custom fields, tags, status, scoring, dedupe | ✅ (we exceed) | Day 29 lead workspace; schema `Contact`/`Lead` w/ dedupe index |
| Lead qualification Hot/Warm/Cold + sentiment + keyword extraction | ✅ | Days 31 post-call intel, 43 QA scoring, 75 conversation intel |
| Bulk outbound campaigns, scheduling, concurrency, retry, queue states | ✅ (we exceed) | Days 28 campaigns, 79 dialer modes; **🔼 add explicit queue-state UI (pending/processing/completed/failed) + per-campaign retry knobs** |
| Inbound per-number flows + routing | ✅ | Day 11 inbound |
| Appointments from call + Google Calendar bi-dir sync + reschedule/cancel | ✅ | Day 36 appointments (schema `Appointment` + calendar fields) |
| Knowledge base: PDF/DOC/TXT/URL/text + RAG | ✅ | Day 20 RAG (schema `KnowledgeBase`/`KbChunk` pgvector) |
| Recording + player + transcripts + summaries + searchable history | ✅ | Days 12 recording/transcription, 42 transcript search |
| Website call widget | ✅ | Day 16 web widget |
| WhatsApp templated messaging + post-call follow-up + per-event toggles | ✅ | Day 44 messaging; **🔼 add per-event notification toggle matrix** |
| **Slack connector** (notifications, channel select, per-event) | ➕ NEW | Add to Day 40 integrations (or as a connector) |
| **HubSpot / Salesforce / Zendesk CRM sync** | ✅ | Day 40 integrations (`IntegrationType` already includes these) |
| Google Sheets import + sync (column mapping, auto-pull) | ✅ | Day 37 sheets/forms |
| **n8n native connector (400+ apps) + importable workflow templates** | 🔼 enhance | Days 47/85 automations + webhooks exist; **add a first-class n8n connector + ready-made workflow templates (incl. instant-dial + form-to-call)** |
| **AI Form Builder (dynamic forms in flows) + form routing + field validation + auto header row** | 🔼 enhance | Day 37 has sheets/forms; **add an in-flow AI Form Builder node + form→endpoint routing** |
| **Form-to-Call automation ("form submitted → AI calls within seconds")** | ➕ NEW (HIGH — user favourite) | New: a webhook/trigger that creates a lead + dials an agent on form submit; pairs with the AI Form Builder + n8n template |
| **Instant AI call API endpoint (`POST /calls/dial`, auto-creates lead)** | ➕ NEW | Add to Day 48 public API as a one-shot dial endpoint |
| Public REST API + SDK + signed webhooks (HMAC) + replay protection + pagination | ✅ | Day 48 public API/SDK; webhook signing pattern (CODE-PATTERNS §4) |
| **In-dashboard interactive API reference (copy-ready curl, "12 endpoints")** | ➕ NEW (DX) | Add an in-app API explorer page (Day 48/49) |
| Personal API keys (hashed, shown-once, revocable) | ✅ | Day 57 key vault / Day 48 API keys (schema `ProviderCredential`/API keys) |
| Telephony: Twilio + **Plivo** + Telnyx + SIP (inbound+outbound) | 🔼 enhance | Days 10/35; **add Plivo adapter** (router config change) |
| SIP trunk (creds, transport, access controls, transcripts/summaries) | ✅ (we exceed) | Day 35 SIP (+ our PRI plan doc); schema `SipTrunk` |
| Phone-number purchase + pool + availability filtering | ✅ | Day 49 ops/number provisioning; schema `PhoneNumber`/`PlatformApiKeyPool` |
| Credit/per-minute billing + plans + **bonus/promo credits** + membership | 🔼 enhance | Days 15 billing, 53 wallet/markup; **add promotional/bonus-credit system** |
| **ElevenLabs/LLM API-key pool (load-balanced)** | ✅ | Schema `PlatformApiKeyPool` (weight/active) — Days 7/57 |
| Multi-tenant SaaS + white-label + BYOK + per-user creds | ✅ (we vastly exceed) | Days 4–5 RLS, 51–58 reseller hierarchy/white-label/key-vault |
| Admin plans/limits/tiers + trials + support tickets | ✅ | Days 15/56 plan builder, 58 quotas; schema `SupportTicket`, `Plan` |
| **Broadcast / platform-wide announcements** | ➕ NEW | Add to Day 55 super-admin (uses `Notification` model) |
| Branding (name/color/logo/favicon/landing/dark mode) | ✅ | Days 52 theming, 1 design system; schema `Tenant.branding` |
| Auth: Google OAuth + email/password + RBAC + SSO | ✅ (we exceed) | Days 3 Clerk, 5 RBAC, 59 SSO/SAML |
| Security: TLS, encrypted keys, rate limiting, CORS, SAST, replay protection, input sanitisation | ✅ | Days 57 (envelope/KMS), 64 security hardening, 70 fraud; CI gitleaks/SAST |
| Analytics dashboards + trend reports + CSV/PDF export | ✅ | Days 14/41 analytics; **🔼 ensure CSV/PDF export + weekly/monthly trend tiles** |
| Built-in content translation | ✅ | Day 88 real-time translation |
| **"Check for Updates" / white-label install update checker** | ➕ NEW (conditional) | Only relevant if we also **sell self-hosted white-label builds**; otherwise N/A for our hosted SaaS. Slot near Day 52 if pursued |
| Execution logs / flow run logs | ✅ | Day 49 ops toolkit + `AuditLog`; **🔼 add automation-run log view (Day 85 `AutomationRun`)** |
| Quick CRM (lightweight) | ✅ (we exceed) | Full lead workspace Day 29 |

---

## Part 4 — Net new / enhance list to incorporate (the deltas)

Keep **all** our planned features; **add** these (most slot into existing days as enhancements):

**➕ Add (genuinely missing):**
1. **Form-to-Call automation** — *"form submitted → AI dials within seconds"* (user's favourite). Trigger: inbound webhook / public form → create `Lead` → dispatch outbound call via the router. (New mini-feature; pair with #2.) — slot ~Day 37/47.
2. **AI Form Builder node** — dynamic forms inside the flow builder, with field validation, routing to endpoints, and Google-Sheets sync (auto header row). — extend Day 37 + builder (Day 18–21).
3. **n8n first-class connector** + **ready-made workflow templates** (instant-dial, form-to-call) + 400+ app reach. — extend Day 47.
4. **Instant AI call endpoint** (`POST /calls/dial`, auto-creates lead). — extend Day 48.
5. **Slack connector** (per-event notifications, channel select). — extend Day 40.
6. **Plivo telephony adapter** (and confirm OpenRouter LLM adapter). — extend Days 7/10 (config change in router).
7. **Broadcast / platform-wide announcements** (super-admin → all tenants). — extend Day 55.
8. **Promotional / bonus credits** in the wallet. — extend Day 53.
9. **In-dashboard interactive API reference** (copy-ready curl, live endpoint explorer). — extend Day 48/49.
10. *(Conditional)* **"Check for Updates" + self-hosted white-label installer** — only if we sell installable white-label builds. — near Day 52/61.

**🔼 Enhance (we have it; match their polish):**
- Per-event **notification toggle matrix** across email/WhatsApp/Slack/webhook.
- Campaign **queue-state monitoring UI** (pending/processing/completed/failed) + per-campaign retry knobs.
- **CSV/PDF export** + weekly/monthly **trend reports** on analytics.
- **Automation/flow run logs** view (`AutomationRun`).
- **Per-connector live connection-status** indicators on the Integrations page.

---

## Part 5 — Where VocalIQ already EXCEEDS both (our moat — keep these)

Neither product has these; they are VocalIQ differentiators (already planned):
- **True multi-tenant isolation with Postgres RLS** + reseller subtree (Days 4–5) — they use app-layer scoping only.
- **Reseller hierarchy / white-label sub-tenants with their own pricing + markup engine + wallets** (Days 51–58).
- **Provider-agnostic router with real-time per-call cost attribution + BYOK/managed metering + fallback** (Days 6–7, 13) — not just BYOK keys.
- **Visual node builder with compiler, versioning, test panel, Squads (multi-agent), A/B testing** (Days 17–30).
- **MCP support, marketplace + automations, public SDK** (Days 46–48).
- **Agent Desk (human handoff), caller reputation/STIR-SHAKEN, fraud/abuse detection, AI-disclosure compliance** (Days 67, 69–71).
- **On-prem / VPC / data-residency, SSO/SAML, scale infra, latency + security hardening** (Days 59–64) + **our PRI/SIP enterprise plan**.
- **Advanced tier:** fine-tuned per-tenant voices/models, emotion-aware voice, pay-by-voice (PCI), voice biometrics, real-time avatars, real-time translation, conversation intelligence, dialer modes, benchmarking (Days 73–94).

**Conclusion:** VocalIQ's plan already covers ~90% of both products and far exceeds them on tenancy, white-label, routing/cost, builder, and the advanced tier. Incorporating the **10 deltas** above (especially **#1 Form-to-Call** and **#2 AI Form Builder** + **#3 n8n templates**) makes VocalIQ a strict superset.

---

## Part 6 — Action when revisited
- Treat Part 4 as a backlog; fold each delta into the **existing day** noted (most are small extensions), or schedule a dedicated "competitive parity" pass after Phase 3.
- Re-fetch both pages before building any specific behaviour (descriptions change; image-only claims weren't captured here).
- Decision pending from owner: do we also ship a **self-hosted white-label installable build** (enables #10 "Check for Updates")? If yes, it changes packaging (installer + update checker) — note in `BUILD-LOG.md`.
