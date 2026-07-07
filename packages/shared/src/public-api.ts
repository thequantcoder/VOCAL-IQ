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

// ── OpenAPI ───────────────────────────────────────────────────────────────────

interface OpenApiOperation {
  method: 'get' | 'post';
  path: string;
  summary: string;
  scope: ApiScope;
}

const OPERATIONS: OpenApiOperation[] = [
  {
    method: 'get',
    path: '/v1/whoami',
    summary: 'Identify the calling API key',
    scope: 'agents:read',
  },
  { method: 'get', path: '/v1/agents', summary: 'List agents', scope: 'agents:read' },
  { method: 'get', path: '/v1/calls', summary: 'List calls', scope: 'calls:read' },
  { method: 'post', path: '/v1/calls', summary: 'Place an outbound call', scope: 'calls:write' },
  { method: 'get', path: '/v1/leads', summary: 'List leads', scope: 'leads:read' },
  {
    method: 'get',
    path: '/v1/analytics/calls',
    summary: 'List call analytics (paginated; PII masked unless pii:read)',
    scope: 'analytics:read',
  },
  {
    method: 'get',
    path: '/v1/analytics/usage',
    summary: 'Usage + cost aggregates',
    scope: 'analytics:read',
  },
];

/** Build the OpenAPI 3.0 document for the public API (served at /v1/openapi.json). */
export function buildOpenApiSpec(version = '1.0.0'): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERATIONS) {
    const item = paths[op.path] ?? {};
    item[op.method] = {
      summary: op.summary,
      security: [{ apiKey: [op.scope] }],
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
