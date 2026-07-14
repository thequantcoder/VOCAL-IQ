import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildOpenApiSpec } from '@vocaliq/shared';
import { describe, expect, it } from 'vitest';

/**
 * Spec-in-sync guard (PARITY-09). Every mounted public `/v1` route (except the meta `openapi.json`)
 * MUST be documented in the OpenAPI spec that powers the in-dashboard interactive reference — so the
 * reference can never silently drift from the routes. Parses this directory's route file for the
 * `r.get('/x')` / `r.post('/x')` path literals and asserts each has a spec entry.
 */
describe('public /v1 routes are all documented (reference in sync)', () => {
  it('every mounted route has an OpenAPI entry', () => {
    const src = readFileSync(join(process.cwd(), 'src/public/v1.routes.ts'), 'utf8');
    const spec = buildOpenApiSpec() as { paths: Record<string, Record<string, unknown>> };

    const re = /r\.(get|post)\(\s*'([^']+)'/g;
    const mounted: { method: string; path: string }[] = [];
    for (let m = re.exec(src); m !== null; m = re.exec(src)) {
      const [, method, path] = m;
      if (path && path !== '/openapi.json')
        mounted.push({ method: method as string, path: `/v1${path}` });
    }

    expect(mounted.length).toBeGreaterThan(0);
    for (const { method, path } of mounted) {
      expect(
        spec.paths[path]?.[method],
        `${method.toUpperCase()} ${path} is mounted but undocumented — add it to OPERATIONS in shared/public-api.ts`,
      ).toBeDefined();
    }
  });
});
