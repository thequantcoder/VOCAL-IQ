/**
 * Shared constants — single source of truth for cross-service magic values
 * (CODING-RULES §3: no scattered literals). Tenancy-related names here MUST match
 * what the API guard and RLS policies use (DATA-MODEL §RLS).
 */

/** HTTP header carrying the active tenant id (resolved + verified server-side). */
export const TENANT_HEADER = 'x-tenant-id';

/** Postgres session var the API/voice set per request; RLS policies read it. */
export const RLS_TENANT_SETTING = 'app.current_tenant';

/** Platform base currency (billing math normalises to this; DATA-MODEL Plan). */
export const BASE_CURRENCY = 'USD';

// ── Pagination (cursor-based; CODING-RULES §8) ────────────────────────────────
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

// ── Agent / call-loop tuning (DATA-MODEL Agent, CODE-PATTERNS §6) ──────────────
export const DEFAULT_TURN_TIMEOUT_MS = 1500;
export const MIN_TURN_TIMEOUT_MS = 500;
export const MAX_TURN_TIMEOUT_MS = 5000;
export const MAX_PERSONA_LENGTH = 20_000;
export const MAX_AGENT_NAME_LENGTH = 120;

/** Embedding dimensionality for KbChunk.embedding (DATA-MODEL — pgvector). */
export const EMBEDDING_DIMENSIONS = 1536;

/** Target time-to-first-audio for the live call loop (CODING-RULES §8). */
export const TTFA_TARGET_MS = 800;
