/**
 * Public API + webhooks (Day 48) — shared contracts. The API-key SCOPES, the webhook EVENT
 * catalogue, scope-checking, and the OpenAPI document live here so the api, the SDK, and the
 * docs all agree. Key hashing + HMAC signing use `node:crypto` and therefore live server-side
 * in the api; everything here is pure + web-safe (self-audit C).
 */

// ── API scopes ────────────────────────────────────────────────────────────────

export const API_SCOPES = [
  'agents:read',
  'calls:read',
  'calls:write',
  'leads:read',
  'campaigns:read',
  // Day 87 — enterprise BI analytics. `analytics:read` grants the read API + exports; `pii:read` is an
  // ADDITIONAL scope that un-masks raw PII (phone/email) in those reads (governance — self-audit C).
  'analytics:read',
  'pii:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Whether a key's granted scopes satisfy a required scope. `*` grants everything. */
export function hasScope(granted: string[], required: ApiScope): boolean {
  return granted.includes('*') || granted.includes(required);
}

// ── Webhook event catalogue ─────────────────────────────────────────────────

export const WEBHOOK_EVENTS = [
  'call.completed',
  'call.failed',
  'lead.created',
  'lead.status_changed',
  'campaign.finished',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(v: string): v is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(v);
}

// ── API reference (OpenAPI + the in-dashboard interactive reference) ──────────

/** A documented request parameter (query or path) for the interactive reference. */
export interface ApiParam {
  in: 'query' | 'path';
  name: string;
  required?: boolean;
  description?: string;
  example?: string;
}

/**
 * One public operation — the SINGLE source of truth behind BOTH the served `/v1/openapi.json`
 * document AND the in-dashboard interactive reference (copy-curl + live "Try it"). Keeping the
 * reference generated from this list means it can never drift from the routes (a test asserts
 * every mounted `/v1` route is documented here).
 */
export interface ApiOperation {
  method: 'get' | 'post';
  path: string;
  group: string;
  summary: string;
  scope: ApiScope;
  params?: ApiParam[];
  /** Example request body for a POST — prefilled into curl + the "Try it" editor. */
  bodyExample?: Record<string, unknown>;
}

/** Group display order for the reference. */
export const API_REFERENCE_GROUPS = [
  'Identity',
  'Agents',
  'Calls',
  'Leads',
  'Analytics',
  'Automation',
] as const;

const OPERATIONS: ApiOperation[] = [
  {
    method: 'get',
    path: '/v1/whoami',
    group: 'Identity',
    summary: 'Identify the calling API key (tenant + granted scopes)',
    scope: 'agents:read',
  },
  {
    method: 'get',
    path: '/v1/agents',
    group: 'Agents',
    summary: 'List agents',
    scope: 'agents:read',
  },
  {
    method: 'get',
    path: '/v1/calls',
    group: 'Calls',
    summary: 'List calls',
    scope: 'calls:read',
  },
  {
    method: 'post',
    path: '/v1/calls',
    group: 'Calls',
    summary: 'Place an outbound call to an existing contact/number',
    scope: 'calls:write',
    bodyExample: {
      agentId: '00000000-0000-0000-0000-000000000000',
      to: '+14155551234',
      consentBasis: 'EXISTING_RELATIONSHIP',
    },
  },
  {
    method: 'post',
    path: '/v1/calls/dial',
    group: 'Calls',
    summary: 'Instant dial: auto-create/dedupe a lead from a phone number, then call it',
    scope: 'calls:write',
    bodyExample: {
      to: '+14155551234',
      agentId: '00000000-0000-0000-0000-000000000000',
      consentBasis: 'EXISTING_RELATIONSHIP',
      name: 'Jane Doe',
    },
  },
  {
    method: 'get',
    path: '/v1/leads',
    group: 'Leads',
    summary: 'List leads (filterable)',
    scope: 'leads:read',
    params: [
      { in: 'query', name: 'status', description: 'Filter by lead status' },
      { in: 'query', name: 'stage', description: 'Filter by pipeline stage' },
      { in: 'query', name: 'owner', description: 'Filter by owner user id' },
    ],
  },
  {
    method: 'get',
    path: '/v1/analytics/calls',
    group: 'Analytics',
    summary: 'List call analytics (paginated; PII masked unless the key also holds pii:read)',
    scope: 'analytics:read',
    params: [
      { in: 'query', name: 'from', description: 'ISO date lower bound', example: '2026-07-01' },
      { in: 'query', name: 'to', description: 'ISO date upper bound', example: '2026-07-31' },
      { in: 'query', name: 'agentId', description: 'Filter by agent id' },
      { in: 'query', name: 'limit', description: '1–1000 (default 100)', example: '100' },
      { in: 'query', name: 'cursor', description: 'Keyset cursor for the next page' },
    ],
  },
  {
    method: 'get',
    path: '/v1/analytics/usage',
    group: 'Analytics',
    summary: 'Usage + cost aggregates',
    scope: 'analytics:read',
    params: [
      { in: 'query', name: 'from', description: 'ISO date lower bound', example: '2026-07-01' },
      { in: 'query', name: 'to', description: 'ISO date upper bound', example: '2026-07-31' },
    ],
  },
  {
    method: 'get',
    path: '/v1/n8n/templates',
    group: 'Automation',
    summary: 'Importable n8n workflow templates + the webhook event catalog',
    scope: 'agents:read',
  },
];

/** The public operations grouped for the interactive reference (empty groups omitted). */
export function apiReferenceGroups(): { group: string; operations: ApiOperation[] }[] {
  return API_REFERENCE_GROUPS.map((group) => ({
    group,
    operations: OPERATIONS.filter((op) => op.group === group),
  })).filter((g) => g.operations.length > 0);
}

/** Every documented operation, flat (used by the sync test + tooling). */
export function apiOperations(): ApiOperation[] {
  return OPERATIONS;
}

/**
 * Build a copy-ready `curl` for an operation. Pure + web-safe: the API key is chosen by the caller
 * (never embedded server-side); when absent, a `$VOCALIQ_API_KEY` placeholder is used so nothing
 * secret is ever baked into shipped HTML (self-audit C).
 */
export function buildCurl(input: {
  baseUrl: string;
  apiKey?: string;
  method: 'get' | 'post';
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}): string {
  const base = input.baseUrl.replace(/\/+$/, '');
  const qs = input.query
    ? Object.entries(input.query)
        .filter(([, v]) => v !== '' && v != null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : '';
  const url = `${base}${input.path}${qs ? `?${qs}` : ''}`;
  const key = input.apiKey?.trim() ? input.apiKey.trim() : '$VOCALIQ_API_KEY';
  const lines = [
    `curl -X ${input.method.toUpperCase()} "${url}"`,
    `  -H "Authorization: Bearer ${key}"`,
  ];
  if (input.method === 'post' && input.body) {
    lines.push('  -H "Content-Type: application/json"');
    lines.push(`  -d '${JSON.stringify(input.body, null, 2)}'`);
  }
  return lines.join(' \\\n');
}

/** Build the OpenAPI 3.0 document for the public API (served at /v1/openapi.json). */
export function buildOpenApiSpec(version = '1.0.0'): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERATIONS) {
    const item = paths[op.path] ?? {};
    item[op.method] = {
      summary: op.summary,
      tags: [op.group],
      security: [{ apiKey: [op.scope] }],
      ...(op.params && op.params.length > 0
        ? {
            parameters: op.params.map((p) => ({
              in: p.in,
              name: p.name,
              required: p.required ?? false,
              ...(p.description ? { description: p.description } : {}),
              schema: { type: 'string' },
            })),
          }
        : {}),
      ...(op.bodyExample
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { example: op.bodyExample } },
            },
          }
        : {}),
      responses: {
        '200': { description: 'Success' },
        '401': { description: 'Missing or invalid API key' },
        '403': { description: 'Insufficient scope' },
        '429': { description: 'Rate limit exceeded' },
      },
    };
    paths[op.path] = item;
  }
  return {
    openapi: '3.0.3',
    info: { title: 'VocalIQ Public API', version, description: 'Programmatic access to VocalIQ.' },
    servers: [{ url: '/', description: 'This deployment' }],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          description: 'Provide your API key as a Bearer token.',
        },
      },
    },
    security: [{ apiKey: [] }],
    paths,
  };
}
