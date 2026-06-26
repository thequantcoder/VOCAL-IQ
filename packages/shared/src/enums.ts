/**
 * Core cross-service enums (DATA-MODEL.md). The Prisma schema (Day 4) is the
 * authoritative source for persisted enums; these mirror them so app/voice code
 * shares one vocabulary. Modelled as const objects + value types (no TS `enum`,
 * which emits runtime code and narrows poorly) — `as const` keeps them light.
 */

// ── Tenancy & RBAC ────────────────────────────────────────────────────────────

export const TenantType = {
  PLATFORM: 'PLATFORM',
  RESELLER: 'RESELLER',
  CUSTOMER: 'CUSTOMER',
} as const;
export type TenantType = (typeof TenantType)[keyof typeof TenantType];

export const TenantStatus = {
  ACTIVE: 'ACTIVE',
  TRIAL: 'TRIAL',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  RESELLER_ADMIN: 'RESELLER_ADMIN',
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  BUILDER: 'BUILDER',
  ANALYST: 'ANALYST',
  AGENT: 'AGENT',
  BILLING: 'BILLING',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

// ── Providers & routing ───────────────────────────────────────────────────────

/** Provider capability classes — every one routed via packages/provider-router. */
export const Capability = {
  LLM: 'llm',
  TTS: 'tts',
  STT: 'stt',
  TELEPHONY: 'telephony',
  EMBEDDING: 'embedding',
} as const;
export type Capability = (typeof Capability)[keyof typeof Capability];

/** Concrete providers (DATA-MODEL ProviderCredential). Adding one is config, not code. */
export const Provider = {
  OPENAI: 'OPENAI',
  ANTHROPIC: 'ANTHROPIC',
  GEMINI: 'GEMINI',
  GROK: 'GROK',
  OPENROUTER: 'OPENROUTER',
  ELEVENLABS: 'ELEVENLABS',
  PLAYHT: 'PLAYHT',
  CARTESIA: 'CARTESIA',
  DEEPGRAM: 'DEEPGRAM',
  ASSEMBLYAI: 'ASSEMBLYAI',
  TWILIO: 'TWILIO',
  TELNYX: 'TELNYX',
  LIVEKIT: 'LIVEKIT',
} as const;
export type Provider = (typeof Provider)[keyof typeof Provider];

// ── Agents & flows ────────────────────────────────────────────────────────────

export const AgentType = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
  MIXED: 'MIXED',
} as const;
export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const AgentStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

/** React Flow node kinds (DATA-MODEL §Agents & flows). */
export const FlowNodeType = {
  START: 'START',
  SAY: 'SAY',
  LISTEN: 'LISTEN',
  DECISION: 'DECISION',
  TOOL: 'TOOL',
  KNOWLEDGE: 'KNOWLEDGE',
  TRANSFER: 'TRANSFER',
  COLLECT_CONFIRM: 'COLLECT_CONFIRM',
  SUBFLOW: 'SUBFLOW',
  SQUAD_HANDOFF: 'SQUAD_HANDOFF',
  END: 'END',
} as const;
export type FlowNodeType = (typeof FlowNodeType)[keyof typeof FlowNodeType];

// ── Telephony & calls ─────────────────────────────────────────────────────────

export const CallDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type CallDirection = (typeof CallDirection)[keyof typeof CallDirection];

export const CallChannel = {
  PSTN: 'PSTN',
  WEB: 'WEB',
  SIP: 'SIP',
} as const;
export type CallChannel = (typeof CallChannel)[keyof typeof CallChannel];

export const CallStatus = {
  QUEUED: 'QUEUED',
  RINGING: 'RINGING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  VOICEMAIL: 'VOICEMAIL',
  NO_ANSWER: 'NO_ANSWER',
} as const;
export type CallStatus = (typeof CallStatus)[keyof typeof CallStatus];

/** Terminal call statuses — no further transitions allowed. */
export const TERMINAL_CALL_STATUSES: readonly CallStatus[] = [
  CallStatus.COMPLETED,
  CallStatus.FAILED,
  CallStatus.VOICEMAIL,
  CallStatus.NO_ANSWER,
];

// ── Leads & pipeline ──────────────────────────────────────────────────────────

export const LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  HOT: 'HOT',
  WARM: 'WARM',
  COLD: 'COLD',
  BOOKED: 'BOOKED',
  LOST: 'LOST',
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const AppointmentStatus = {
  BOOKED: 'BOOKED',
  RESCHEDULED: 'RESCHEDULED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

// ── Billing & plans ───────────────────────────────────────────────────────────

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  TRIALING: 'TRIALING',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

/** Plan-gated capabilities (DATA-MODEL Plan.features) — enforced via feature flags. */
export const PlanFeature = {
  OUTBOUND_CAMPAIGNS: 'OUTBOUND_CAMPAIGNS',
  SIP_TRUNKING: 'SIP_TRUNKING',
  WHITE_LABEL: 'WHITE_LABEL',
  API_ACCESS: 'API_ACCESS',
  ADVANCED_ANALYTICS: 'ADVANCED_ANALYTICS',
  AGENT_DESK: 'AGENT_DESK',
  VOICE_CLONING: 'VOICE_CLONING',
  MULTILINGUAL: 'MULTILINGUAL',
  RAG_KNOWLEDGE: 'RAG_KNOWLEDGE',
  AB_TESTING: 'AB_TESTING',
} as const;
export type PlanFeature = (typeof PlanFeature)[keyof typeof PlanFeature];

// ── Feature flags ─────────────────────────────────────────────────────────────

export const FeatureFlagScope = {
  GLOBAL: 'GLOBAL',
  PLAN: 'PLAN',
  TENANT: 'TENANT',
} as const;
export type FeatureFlagScope = (typeof FeatureFlagScope)[keyof typeof FeatureFlagScope];
