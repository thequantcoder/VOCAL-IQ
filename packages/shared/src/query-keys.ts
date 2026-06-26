/**
 * TanStack Query key factories — the single source of cache keys for the web app.
 *
 * Golden rule #1 (tenancy) applies to the CACHE too: every key is prefixed with
 * `['t', tenantId, ...]`, so one tenant's cached data can never collide with or
 * leak into another's, and invalidating a tenant is a single prefix match. Always
 * use these factories instead of inline arrays (CODING-RULES §4).
 */

/** Opaque, serialisable filter object for list queries. */
export type QueryFilters = Record<string, string | number | boolean | null | undefined>;

const root = (tenantId: string) => ['t', tenantId] as const;

/** Build a per-entity factory: `all` / `lists` / `list(filters)` / `details` / `detail(id)`. */
function entityKeys<E extends string>(entity: E) {
  return {
    all: (tenantId: string) => [...root(tenantId), entity] as const,
    lists: (tenantId: string) => [...root(tenantId), entity, 'list'] as const,
    list: (tenantId: string, filters?: QueryFilters) =>
      [...root(tenantId), entity, 'list', filters ?? {}] as const,
    details: (tenantId: string) => [...root(tenantId), entity, 'detail'] as const,
    detail: (tenantId: string, id: string) => [...root(tenantId), entity, 'detail', id] as const,
  };
}

export const queryKeys = {
  /** Everything for a tenant — use to invalidate the whole tenant scope. */
  tenant: (tenantId: string) => root(tenantId),

  agents: entityKeys('agents'),
  flows: entityKeys('flows'),
  voices: entityKeys('voices'),
  calls: entityKeys('calls'),
  contacts: entityKeys('contacts'),
  leads: entityKeys('leads'),
  campaigns: entityKeys('campaigns'),
  appointments: entityKeys('appointments'),
  phoneNumbers: entityKeys('phoneNumbers'),
  knowledgeBases: entityKeys('knowledgeBases'),
  members: entityKeys('members'),
  apiKeys: entityKeys('apiKeys'),

  /** Cross-entity analytics, parameterised by a filter window. */
  analytics: {
    all: (tenantId: string) => [...root(tenantId), 'analytics'] as const,
    summary: (tenantId: string, filters?: QueryFilters) =>
      [...root(tenantId), 'analytics', 'summary', filters ?? {}] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
