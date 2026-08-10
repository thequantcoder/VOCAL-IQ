import { z } from 'zod';
import { zE164 } from './schemas.js';

/**
 * Phone-number provisioning contracts (search / buy / release). Shared by api (validate + persist) and
 * web (typed hooks). Provisioning fills the "buy a number" gap on top of the existing PhoneNumber pool
 * (assignment/KYC lives in the ops toolkit). Provider-agnostic: today Twilio, gated to a mock when no
 * carrier credentials are configured.
 */

export const NUMBER_CAPABILITIES = ['VOICE', 'SMS', 'MMS'] as const;
export type NumberCapability = (typeof NUMBER_CAPABILITIES)[number];

/** Search the carrier for available numbers to buy. */
export const numberSearchSchema = z.object({
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'ISO 2-letter country code')
    .transform((s) => s.toUpperCase())
    .default('US'),
  areaCode: z
    .string()
    .regex(/^\d{2,5}$/, 'Digits only')
    .optional(),
  contains: z.string().max(10).optional(),
  smsEnabled: z.coerce.boolean().optional(),
  voiceEnabled: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});
export type NumberSearchInput = z.infer<typeof numberSearchSchema>;

/** Buy a specific number (from the search results) into the tenant's pool. */
export const numberBuySchema = z.object({
  e164: zE164,
  agentId: z.string().uuid().optional(),
});
export type NumberBuyInput = z.infer<typeof numberBuySchema>;

/** A carrier number available to purchase (search result). */
export interface AvailableNumberDto {
  e164: string;
  friendlyName: string;
  locality?: string;
  region?: string;
  country: string;
  capabilities: string[];
  monthlyCostUsd: number;
  /** True when returned from the mock catalogue (no live carrier credentials). */
  mock: boolean;
}

/** A number owned by the tenant (in their pool). */
export interface OwnedNumberDto {
  id: string;
  e164: string;
  provider: string;
  source: string; // POOL | PURCHASED | SIP
  capabilities: string[];
  monthlyCostUsd: number;
  assignedAgentId: string | null;
  createdAt: string;
}
