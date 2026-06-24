# PROMPT-INDEX.md — The Full Day-by-Day Map

Every day is one file in `super-prompts/`. Execute **in order** — later days assume earlier ones. Each header shows the recommended model (`🧠 OPUS` for hard/architectural/security/voice/billing, `⚡ SONNET` for CRUD/UI/tests/config). Heavy days marked `(2 sessions)` may take two Claude Code sessions.

> Run a day with: `Read CLAUDE.md, then execute super-prompts/DAY-NN-*.md following the daily loop.`

---

## Phase 0 — Foundations (Days 0–6)
| Day | Title | Model |
|----|-------|-------|
| 00 | Repo scaffold, monorepo, env, .gitignore, first push | 🧠 OPUS |
| 01 | CI/CD, Docker dev stack, base config, design tokens | ⚡ SONNET |
| 02 | Shared package: types, Zod, env schema, error model | 🧠 OPUS |
| 03 | Auth + sessions + MFA (Clerk) wiring | ⚡ SONNET |
| 04 | Multi-tenant data model + Prisma schema + RLS | 🧠 OPUS |
| 05 | RBAC, tenant guard, tenancy isolation tests | 🧠 OPUS |
| 06 | Provider-router skeleton + one proven AI call (text) | 🧠 OPUS |

## Phase 1 — Core calling MVP (Days 7–16)
| Day | Title | Model |
|----|-------|-------|
| 07 | Provider Router core (LLM/TTS/STT/telephony adapters) (2 sessions) | 🧠 OPUS |
| 08 | Voice service skeleton (FastAPI + LiveKit room + media bridge) | 🧠 OPUS |
| 09 | Live call loop: STT→LLM→TTS streaming + turn-taking + barge-in (2 sessions) | 🧠 OPUS |
| 10 | Outbound calling via Twilio + voicemail detection | 🧠 OPUS |
| 11 | Inbound answering + number assignment + concurrency | 🧠 OPUS |
| 12 | Recording → R2 + streaming transcription + storage | ⚡ SONNET |
| 13 | Cost attribution engine + UsageRecord pipeline | 🧠 OPUS |
| 14 | First dashboard: create agent (prompt-based), place call, see transcript+cost | ⚡ SONNET |
| 15 | Stripe subscriptions + metered minutes + plan gating | 🧠 OPUS |
| 16 | Web-call widget (browser WebRTC) + click-to-call | ⚡ SONNET |

## Phase 2 — Builder & conversations (Days 17–30)
| Day | Title | Model |
|----|-------|-------|
| 17 | React Flow canvas foundation + node/edge model | 🧠 OPUS |
| 18 | Core nodes: Start, Say, Listen, Decision, End | ⚡ SONNET |
| 19 | Tool node + function calling + webhook node | 🧠 OPUS |
| 20 | Knowledge node + RAG ingestion (pgvector) | 🧠 OPUS |
| 21 | Collect&Confirm, Transfer, Sub-flow nodes | ⚡ SONNET |
| 22 | Flow compiler: graph → runnable conversation spec | 🧠 OPUS |
| 23 | Live test panel + versioning + rollback | ⚡ SONNET |
| 24 | Prompt & persona studio + templates marketplace | ⚡ SONNET |
| 25 | Multilingual + auto language detection | 🧠 OPUS |
| 26 | Voice library + per-agent voice config + cloning (gated) | 🧠 OPUS |
| 27 | Multi-agent Squads + shared context bus + per-node model swap (2 sessions) | 🧠 OPUS |
| 28 | Campaign manager: lists, CSV import, scheduling, pacing, retries | 🧠 OPUS |
| 29 | Lead workspace + custom fields + tags + Hot/Warm/Cold scoring | ⚡ SONNET |
| 30 | A/B testing for scripts/voices/openers | ⚡ SONNET |

## Phase 2.5 — Lead intel, testing, telephony (Days 31–40)
| Day | Title | Model |
|----|-------|-------|
| 31 | Post-call intelligence: AI summary + keyword extraction | ⚡ SONNET |
| 32 | Agent testing suite: conversation simulator/sandbox | 🧠 OPUS |
| 33 | Batch/scenario testing + automated eval rubrics | 🧠 OPUS |
| 34 | Agent Memory across calls (persistent context) | 🧠 OPUS |
| 35 | BYO-SIP trunk engine + 13+ provider templates (2 sessions) | 🧠 OPUS |
| 36 | Appointments module + Google Calendar 2-way sync | ⚡ SONNET |
| 37 | Google Sheets live sync + form builder | ⚡ SONNET |
| 38 | Cost/reliability protection: auto hang-up, key-pool LB, turn timeout, banned words | 🧠 OPUS |
| 39 | Advanced transcription controls (key-terms, no-verbatim) + source attribution | ⚡ SONNET |
| 40 | Built-in integrations: HubSpot/Salesforce/Zendesk/Calendars | ⚡ SONNET |

## Phase 3 — Analytics, multi-channel, polish (Days 41–50)
| Day | Title | Model |
|----|-------|-------|
| 41 | Real-time + historical analytics dashboards (Timescale) | 🧠 OPUS |
| 42 | Transcript full-text + semantic search | ⚡ SONNET |
| 43 | Automated QA scoring (LLM rubrics) at scale | 🧠 OPUS |
| 44 | Multi-channel messaging: WhatsApp/SMS follow-ups + blended campaigns | 🧠 OPUS |
| 45 | Multimodality (one agent: voice+text+chat) | 🧠 OPUS |
| 46 | MCP & tool-server support + trust context | 🧠 OPUS |
| 47 | Integrations marketplace + cross-channel automations | ⚡ SONNET |
| 48 | Public API + SDKs + webhooks + rate limits/metering | 🧠 OPUS |
| 49 | SaaS ops toolkit: support ticketing, credits, number pool/KYC, notifications, trials | ⚡ SONNET |
| 50 | Onboarding flows + motion/animation polish pass | ⚡ SONNET |
| +  | *(Agent Desk — Day 67 — ideally slotted here or earlier; see cross-cutting days below)* | 🧠 OPUS |

## Phase 4 — White-label & reseller (Days 51–58)
| Day | Title | Model |
|----|-------|-------|
| 51 | Reseller hierarchy + sub-tenant provisioning | 🧠 OPUS |
| 52 | Custom domains + per-tenant theming/branding (Cloudflare for SaaS) | 🧠 OPUS |
| 53 | Markup + wallet engine + wholesale→retail reconciliation (2 sessions) | 🧠 OPUS |
| 54 | Reseller portal dashboards (revenue, margin, clients) | ⚡ SONNET |
| 55 | Super-admin console: tenants, resellers, system health | 🧠 OPUS |
| 56 | No-code plan & pricing builder | 🧠 OPUS |
| 57 | Provider key vault + routing defaults + key-pool admin | 🧠 OPUS |
| 58 | Feature flags + entitlements + quota enforcement + audit log | 🧠 OPUS |

## Phase 5 — Scale & enterprise (Days 59–66)
| Day | Title | Model |
|----|-------|-------|
| 59 | SSO/SAML (WorkOS) + enterprise auth | 🧠 OPUS |
| 60 | Compliance track: consent, DNC, redaction, retention, PCI-safe capture | 🧠 OPUS |
| 61 | On-premise/VPC deployment + data residency | 🧠 OPUS |
| 62 | Scale infra: ClickHouse, Qdrant, K8s, multi-region voice | 🧠 OPUS |
| 63 | Performance & latency hardening pass (voice loop) | 🧠 OPUS |
| 64 | Security hardening + pen-test fixes + abuse controls | 🧠 OPUS |
| 65 | Mobile app (optional) + speech-to-speech mode | 🧠 OPUS |
| 66 | Launch readiness: load test, runbooks, status page, docs, go-live | 🧠 OPUS |

## Cross-cutting days (slot where noted, not at the very end)
These two were added after a coverage audit. They're numbered high to avoid renumbering, but should be done **earlier** where indicated.
| Day | Title | Model | When to actually do it |
|----|-------|-------|------------------------|
| 67 | Agent Desk — human transfer/escalation surface | 🧠 OPUS | Right after **Day 27** (transfers need a destination); before launch at the latest |
| 68 | UI i18n & localization (interface, RTL, currency, emails) | ⚡ SONNET | Foundation right after **Day 1**; full translation around **Day 50** |

> **Agent Desk is the blueprint's 5th panel** (§7.2) and the real target of every "transfer to human" path (Day 21/27). Don't skip it if you need human escalation at launch — most deployments do.

---

## Core-tier additions (🔴 do these EARLY — they're not optional)
Added after a "make it #1" review. Despite high day numbers, slot them into the phases shown — they protect the business.
| Day | Title | Model | When |
|----|-------|-------|------|
| 69 | Caller reputation, branded caller ID & STIR/SHAKEN | 🧠 OPUS | **Phase 1–2** — before serious outbound volume (spam-flagging kills answer rates) |
| 70 | Real-time fraud & abuse detection | 🧠 OPUS | **Phase 1–4** — protects carrier relationships + trust |
| 71 | AI disclosure & "press 1 for human" compliance | 🧠 OPUS | **Phase 2–3** — increasingly legally required |
| 72 | Email as a campaign channel + consented mid-call email capture | ⚡ SONNET | **with Day 44** (messaging) |

## Phase 6 — Advanced / Differentiators (🟣 Days 73–94)
Build after the launchable product (Phases 0–5) is live. These make VocalIQ category-leading. Pick the subset that fits your market; each is self-contained.
| Day | Title | Model |
|----|-------|-------|
| 73 | Sentiment-triggered live actions & alerts | 🧠 OPUS |
| 74 | AI coaching / whisper for human agents | 🧠 OPUS |
| 75 | Conversation intelligence (objections, buying signals, competitors) | 🧠 OPUS |
| 76 | Custom fine-tuned voices & models per tenant | 🧠 OPUS |
| 77 | Emotion-aware voice modulation | 🧠 OPUS |
| 78 | PCI-safe pay-by-voice (payment collection) | 🧠 OPUS |
| 79 | Advanced dialer modes (predictive/power/progressive) | 🧠 OPUS |
| 80 | Caller-requested callback scheduling | ⚡ SONNET |
| 81 | Revenue attribution dashboard | 🧠 OPUS |
| 82 | Outcome-based billing (per booking / qualified lead) | 🧠 OPUS |
| 83 | Agent template marketplace + revenue share | 🧠 OPUS |
| 84 | Developer app / integration marketplace | 🧠 OPUS |
| 85 | Visual workflow automation builder (Zapier-style) | 🧠 OPUS |
| 86 | Multi-agent analytics benchmarking | ⚡ SONNET |
| 87 | Voice analytics API for enterprise BI | ⚡ SONNET |
| 88 | Real-time language translation (caller ↔ operator) | 🧠 OPUS |
| 89 | AI agents that learn from top human reps | 🧠 OPUS |
| 90 | Live call co-pilot for human sales teams | 🧠 OPUS |
| 91 | Voice biometrics (identity verification) | 🧠 OPUS |
| 92 | Digital human / video avatar agents | 🧠 OPUS |
| 93 | Telegram / Messenger / Instagram / RCS channels | ⚡ SONNET |
| 94 | Phase 6 integration, hardening & advanced-tier launch | 🧠 OPUS |
| 95 | Marketing landing page & signature waveform hero | 🧠 OPUS |

> 🎨 **Design:** every UI day reads `DESIGN-SYSTEM.md` and meets its senior-FE floor (identity, motion, a11y, four states, perceived performance). The visual identity foundation ships **Day 1**; the full smart-onboarding + motion polish is **Day 50**; the public hero is **Day 95**.

---

## Notes
- **96 days** total (00–66 core + 67 Agent Desk + 68 i18n + 69–72 core-tier + 73–94 Phase 6 + 95 landing). Day = unit of work, not a calendar day; heavy `(2 sessions)` days take two.
- You can **reorder within a phase** if a dependency or business need shifts, but never start a phase before its predecessor's core is green.
- Each day file is self-contained: Prerequisites, Context to load, Objective, step-by-step build, Definition of Done, Self-audit focus, Commit plan, Report. **Every day (00–94) is a complete, ready-to-run file** — none are stubs.
- **Recommended launch path:** build Phases 0–5 + Agent Desk (67) + the 🔴 core-tier days (69–72) to a sellable v1.0, then add Phase 6 (73–94) as the advanced tier. Don't let the advanced features delay first revenue.
