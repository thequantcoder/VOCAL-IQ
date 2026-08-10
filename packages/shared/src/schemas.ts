import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_AGENT_NAME_LENGTH,
  MAX_PAGE_SIZE,
  MAX_PERSONA_LENGTH,
  MAX_TURN_TIMEOUT_MS,
  MIN_TURN_TIMEOUT_MS,
} from './constants.js';
import { AgentType } from './enums.js';

/**
 * Shared Zod schemas — validate at every boundary (CODE-PATTERNS §6, CODING-RULES §2).
 * Reusable primitives + a couple of canonical domain DTOs that later days extend.
 * Keep request/response contracts here so api, web, and workers agree on one shape.
 */

// ── Primitives ────────────────────────────────────────────────────────────────

/** UUID v4 identifier (matches Prisma `@db.Uuid`). */
export const zUuid = z.string().uuid();

export const zEmail = z.string().email().max(254);

/** URL-safe slug: lowercase, digits, single hyphens. */
export const zSlug = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase letters, numbers, and single hyphens');

/** E.164 phone number (e.g. +14155550100). */
export const zE164 = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Must be E.164 format, e.g. +14155550100');

/** BCP-47 language tag (loose check, e.g. en, en-US, pt-BR). */
export const zLanguageTag = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, 'Must be a BCP-47 language tag, e.g. en-US');

// ── Pagination (cursor-based; CODING-RULES §8) ────────────────────────────────

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Generic paginated response envelope. */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

// ── Canonical domain DTOs (CODE-PATTERNS §6) ──────────────────────────────────

export const createAgentSchema = z.object({
  name: z.string().min(1).max(MAX_AGENT_NAME_LENGTH),
  description: z.string().max(2_000).optional(),
  persona: z.string().max(MAX_PERSONA_LENGTH),
  languages: z.array(zLanguageTag).min(1),
  type: z.nativeEnum(AgentType).default(AgentType.INBOUND),
  turnTimeoutMs: z.number().int().min(MIN_TURN_TIMEOUT_MS).max(MAX_TURN_TIMEOUT_MS),
});
export type CreateAgentDto = z.infer<typeof createAgentSchema>;

/** Updates are a partial of create — at least one field required. */
export const updateAgentSchema = createAgentSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;
