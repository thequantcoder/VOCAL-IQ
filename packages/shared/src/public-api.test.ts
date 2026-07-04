import { describe, expect, it } from 'vitest';
import { WEBHOOK_EVENTS, buildOpenApiSpec, hasScope, isWebhookEvent } from './public-api.js';

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
});
