/**
 * Core cross-service enums (DATA-MODEL.md). The Prisma schema (Day 4) is the
 * authoritative source for persisted enums; these mirror them for app/voice code.
 * Kept minimal at Day 0 — extended as features land.
 */

export const TenantType = {
  PLATFORM: 'PLATFORM',
  RESELLER: 'RESELLER',
  CUSTOMER: 'CUSTOMER',
} as const;
export type TenantType = (typeof TenantType)[keyof typeof TenantType];

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

/** Provider capability classes — routed via packages/provider-router. */
export const Capability = {
  LLM: 'llm',
  TTS: 'tts',
  STT: 'stt',
  TELEPHONY: 'telephony',
  EMBEDDING: 'embedding',
} as const;
export type Capability = (typeof Capability)[keyof typeof Capability];
