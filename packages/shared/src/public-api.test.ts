import { describe, expect, it } from 'vitest';
import {
  API_REFERENCE_GROUPS,
  WEBHOOK_EVENTS,
  apiOperations,
  apiReferenceGroups,
  buildCurl,
  buildOpenApiSpec,
  hasScope,
  isWebhookEvent,
} from './public-api.js';

describe('hasScope', () => {
  it('grants an exact scope and everything under a wildcard', () => {
    expect(hasScope(['calls:read'], 'calls:read')).toBe(true);
    expect(hasScope(['calls:read'], 'calls:write')).toBe(false);
    expect(hasScope(['*'], 'leads:read')).toBe(true);
    expect(hasScope([], 'agents:read')).toBe(false);
  });
});

describe('webhook events', () => {
  it('validates known events', () => {
    expect(isWebhookEvent('call.completed')).toBe(true);
    expect(isWebhookEvent('not.an.event')).toBe(false);
    expect(WEBHOOK_EVENTS.length).toBeGreaterThan(0);
  });
});

describe('buildOpenApiSpec', () => {
  it('produces a valid-shaped OpenAPI 3 document with paths + bearer security', () => {
    const spec = buildOpenApiSpec('2.0.0') as {
      openapi: string;
      info: { version: string };
      paths: Record<string, unknown>;
      components: { securitySchemes: { apiKey: { scheme: string } } };
    };
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.version).toBe('2.0.0');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    expect(spec.paths['/v1/agents']).toBeDefined();
    expect(spec.components.securitySchemes.apiKey.scheme).toBe('bearer');
  });

  it('documents a request body for POST /v1/calls/dial and query params for analytics', () => {
    const spec = buildOpenApiSpec() as {
      paths: Record<string, Record<string, { requestBody?: unknown; parameters?: unknown[] }>>;
    };
    expect(spec.paths['/v1/calls/dial']?.post?.requestBody).toBeDefined();
    expect(spec.paths['/v1/analytics/calls']?.get?.parameters?.length).toBeGreaterThan(0);
  });
});

describe('apiReferenceGroups (in-dashboard reference source)', () => {
  it('groups every operation under a known group, with no empty groups', () => {
    const groups = apiReferenceGroups();
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(API_REFERENCE_GROUPS).toContain(g.group);
      expect(g.operations.length).toBeGreaterThan(0);
    }
    // every flat operation is placed in exactly one rendered group
    const grouped = groups.flatMap((g) => g.operations);
    expect(grouped.length).toBe(apiOperations().length);
  });

  it('every operation appears in the served OpenAPI spec (reference ⇔ spec in sync)', () => {
    const spec = buildOpenApiSpec() as { paths: Record<string, Record<string, unknown>> };
    for (const op of apiOperations()) {
      expect(spec.paths[op.path]?.[op.method]).toBeDefined();
    }
  });

  it('includes the newer parity endpoints', () => {
    const paths = apiOperations().map((o) => `${o.method} ${o.path}`);
    expect(paths).toContain('post /v1/calls/dial');
    expect(paths).toContain('get /v1/n8n/templates');
  });
});

describe('buildCurl', () => {
  it('builds a GET curl with the bearer key and no body', () => {
    const curl = buildCurl({
      baseUrl: 'https://api.example.com/',
      apiKey: 'vq_live_abc',
      method: 'get',
      path: '/v1/agents',
    });
    expect(curl).toContain('curl -X GET "https://api.example.com/v1/agents"');
    expect(curl).toContain('-H "Authorization: Bearer vq_live_abc"');
    expect(curl).not.toContain('-d ');
  });

  it('builds a POST curl with a JSON body + content-type', () => {
    const curl = buildCurl({
      baseUrl: 'https://api.example.com',
      apiKey: 'vq_live_abc',
      method: 'post',
      path: '/v1/calls/dial',
      body: { to: '+14155551234' },
    });
    expect(curl).toContain('curl -X POST');
    expect(curl).toContain('-H "Content-Type: application/json"');
    expect(curl).toContain('"to": "+14155551234"');
  });

  it('appends a query string and uses a placeholder when no key is given (no secret baked in)', () => {
    const curl = buildCurl({
      baseUrl: 'https://api.example.com',
      method: 'get',
      path: '/v1/analytics/usage',
      query: { from: '2026-07-01', to: '' },
    });
    expect(curl).toContain('?from=2026-07-01');
    expect(curl).not.toContain('to='); // empty values dropped
    expect(curl).toContain('$VOCALIQ_API_KEY'); // placeholder, never a real key
  });
});
