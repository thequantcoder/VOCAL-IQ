import { describe, expect, it } from 'vitest';
import { queryKeys } from './query-keys.js';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

describe('queryKeys (tenant-namespaced)', () => {
  it('prefixes every key with ["t", tenantId] so caches cannot collide across tenants', () => {
    const keys = [
      queryKeys.agents.all(TENANT_A),
      queryKeys.agents.list(TENANT_A, { status: 'PUBLISHED' }),
      queryKeys.agents.detail(TENANT_A, 'agent-1'),
      queryKeys.calls.lists(TENANT_A),
      queryKeys.analytics.summary(TENANT_A, { range: '7d' }),
      queryKeys.tenant(TENANT_A),
    ];
    for (const key of keys) {
      expect(key[0]).toBe('t');
      expect(key[1]).toBe(TENANT_A);
    }
  });

  it('produces different keys for different tenants (no leakage)', () => {
    const a = queryKeys.agents.detail(TENANT_A, 'agent-1');
    const b = queryKeys.agents.detail(TENANT_B, 'agent-1');
    expect(a).not.toEqual(b);
  });

  it('list keys are stable and include their filters', () => {
    const f = { status: 'HOT', q: 'acme' };
    expect(queryKeys.leads.list(TENANT_A, f)).toEqual(['t', TENANT_A, 'leads', 'list', f]);
    expect(queryKeys.leads.list(TENANT_A)).toEqual(['t', TENANT_A, 'leads', 'list', {}]);
  });
});
