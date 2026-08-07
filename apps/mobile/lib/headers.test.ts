import { buildHeaders } from './headers';

/**
 * Pure unit test of the mobile request-header contract. No expo / native / fetch
 * mocks are needed because `buildHeaders` is dependency-free — this is the harness's
 * "pure test" and it pins the tenant-scoping invariant (self-audit B/C).
 */
describe('buildHeaders — mobile tenant-scoping contract', () => {
  it('always sends JSON content-type', () => {
    expect(buildHeaders(null, null)['content-type']).toBe('application/json');
  });

  it('omits auth + tenant headers when the caller is unauthenticated', () => {
    const h = buildHeaders(null, null);
    expect(h.authorization).toBeUndefined();
    expect(h['x-tenant-id']).toBeUndefined();
  });

  it('adds a Bearer token when a JWT is present', () => {
    expect(buildHeaders('jwt-123', null).authorization).toBe('Bearer jwt-123');
  });

  it('scopes the request to the active tenant via x-tenant-id', () => {
    expect(buildHeaders('jwt-123', 'tenant-abc')['x-tenant-id']).toBe('tenant-abc');
  });

  it('lets caller-supplied headers override the defaults (last-wins)', () => {
    const h = buildHeaders('jwt', 'tenant-abc', {
      'content-type': 'text/plain',
      'x-custom': '1',
    });
    expect(h['content-type']).toBe('text/plain');
    expect(h['x-custom']).toBe('1');
    // auth + tenant survive the merge
    expect(h.authorization).toBe('Bearer jwt');
    expect(h['x-tenant-id']).toBe('tenant-abc');
  });
});
