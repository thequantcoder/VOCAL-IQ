import { describe, expect, it } from 'vitest';
import {
  PHASE6_FEATURES,
  PLAN_FEATURE_DEFAULTS,
  planIncludesFeature,
  resolveAdvancedFeatures,
} from './phase6-features.js';

describe('Phase-6 feature entitlements (Day 94)', () => {
  it('Free gets no advanced features; Pro gets the light set; Scale gets everything', () => {
    expect(planIncludesFeature('Free', {}, 'translation')).toBe(false);
    expect(planIncludesFeature('Free', {}, 'videoAvatar')).toBe(false);
    expect(planIncludesFeature('Pro', {}, 'translation')).toBe(true);
    expect(planIncludesFeature('Pro', {}, 'liveCopilot')).toBe(true);
    // Heavy/sensitive features are Scale-only.
    expect(planIncludesFeature('Pro', {}, 'videoAvatar')).toBe(false);
    expect(planIncludesFeature('Pro', {}, 'voiceBiometrics')).toBe(false);
    expect(planIncludesFeature('Scale', {}, 'videoAvatar')).toBe(true);
    expect(planIncludesFeature('Scale', {}, 'voiceBiometrics')).toBe(true);
  });

  it('an explicit plan.features override wins over the tier default (custom plans)', () => {
    // A custom Pro plan that adds video avatars.
    expect(planIncludesFeature('Pro', { videoAvatar: true }, 'videoAvatar')).toBe(true);
    // A restricted Scale plan that removes biometrics.
    expect(planIncludesFeature('Scale', { voiceBiometrics: false }, 'voiceBiometrics')).toBe(false);
  });

  it('an unknown plan or feature denies by default', () => {
    expect(planIncludesFeature('Mystery', {}, 'translation')).toBe(false);
    expect(planIncludesFeature('Scale', null, 'translation')).toBe(true); // null features → tier default
  });

  it('resolveAdvancedFeatures returns a complete boolean map for every catalogue key', () => {
    const scale = resolveAdvancedFeatures('Scale', {});
    expect(Object.keys(scale).sort()).toEqual(PHASE6_FEATURES.map((f) => f.key).sort());
    expect(Object.values(scale).every((v) => v === true)).toBe(true);
    const free = resolveAdvancedFeatures('Free', {});
    expect(Object.values(free).every((v) => v === false)).toBe(true);
  });

  it('the tier defaults are internally consistent (Pro ⊆ Scale)', () => {
    for (const f of PHASE6_FEATURES) {
      if (PLAN_FEATURE_DEFAULTS.Pro?.[f.key]) {
        expect(PLAN_FEATURE_DEFAULTS.Scale?.[f.key]).toBe(true);
      }
    }
  });
});
