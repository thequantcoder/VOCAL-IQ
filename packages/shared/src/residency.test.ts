import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REGION,
  isRegionAllowed,
  platformRegion,
  regionEndpoints,
  residencyConfigSchema,
  residencyPermits,
  resolveRegion,
} from './residency.js';

describe('region catalog', () => {
  it('validates known regions', () => {
    expect(isRegionAllowed('eu-west-1')).toBe(true);
    expect(isRegionAllowed('mars-1')).toBe(false);
  });
  it('platformRegion honors env, else default', () => {
    expect(platformRegion({ DATA_REGION: 'eu-central-1' } as NodeJS.ProcessEnv)).toBe(
      'eu-central-1',
    );
    expect(platformRegion({ DATA_REGION: 'nope' } as NodeJS.ProcessEnv)).toBe(DEFAULT_REGION);
    expect(platformRegion({})).toBe(DEFAULT_REGION);
  });
});

describe('resolveRegion', () => {
  it('prefers a valid pinned region, else the platform default, else the global default', () => {
    expect(resolveRegion('uk-south-1', 'us-east-1')).toBe('uk-south-1');
    expect(resolveRegion(null, 'eu-west-1')).toBe('eu-west-1');
    expect(resolveRegion('bogus', 'also-bogus')).toBe(DEFAULT_REGION);
  });
});

describe('regionEndpoints', () => {
  it('returns the regional storage + voice hosts', () => {
    const e = regionEndpoints('eu-west-1');
    expect(e.storageHost).toContain('eu-west-1');
    expect(e.voiceHost).toContain('eu-west-1');
    expect(e.region).toBe('eu-west-1');
  });
  it('falls back to the default region for an unknown id', () => {
    expect(regionEndpoints('bogus').region).toBe(DEFAULT_REGION);
  });
});

describe('residencyConfigSchema + residencyPermits', () => {
  it('rejects an unknown region and defaults strictEgress off', () => {
    const c = residencyConfigSchema.parse({ region: 'eu-west-1' });
    expect(c.strictEgress).toBe(false);
    expect(() => residencyConfigSchema.parse({ region: 'nope' })).toThrow();
  });
  it('permits any jurisdiction when not strict; enforces a match when strict', () => {
    const eu = residencyConfigSchema.parse({ region: 'eu-west-1', strictEgress: true });
    expect(residencyPermits(eu, 'EU')).toBe(true);
    expect(residencyPermits(eu, 'US')).toBe(false);
    const lax = residencyConfigSchema.parse({ region: 'eu-west-1', strictEgress: false });
    expect(residencyPermits(lax, 'US')).toBe(true);
  });
});
