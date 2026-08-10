import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  MOTION_DURATIONS,
  MOTION_LEVELS,
  THEME_PRESETS,
  THEME_PRESET_SWATCHES,
  parseThemeConfig,
} from './theme.js';

describe('theme contract (UX-00)', () => {
  it('defaults to the nebula preset, system mode, full motion', () => {
    expect(DEFAULT_THEME.preset).toBe('nebula');
    expect(DEFAULT_THEME.mode).toBe('system');
    expect(DEFAULT_THEME.motion).toBe('full');
    expect(DEFAULT_THEME.radius).toBe('soft');
    expect(DEFAULT_THEME.density).toBe('comfortable');
  });

  it('parses partial/garbage config into a valid theme (bad fields → defaults)', () => {
    expect(parseThemeConfig(undefined)).toEqual(DEFAULT_THEME);
    expect(parseThemeConfig({ preset: 'not-a-preset' })).toEqual(DEFAULT_THEME);
    const custom = parseThemeConfig({ preset: 'aurora', motion: 'reduced', density: 'compact' });
    expect(custom.preset).toBe('aurora');
    expect(custom.motion).toBe('reduced');
    expect(custom.density).toBe('compact');
  });

  it('accepts a valid custom color override + rejects a bad hex', () => {
    expect(parseThemeConfig({ colors: { primary: '#123abc' } }).colors.primary).toBe('#123abc');
    // A malformed color is dropped back to defaults (empty colors).
    expect(parseThemeConfig({ colors: { primary: 'blue' } }).colors.primary).toBeUndefined();
  });

  it('every preset has a base swatch + motion levels/durations are well-formed', () => {
    for (const p of THEME_PRESETS) {
      expect(THEME_PRESET_SWATCHES[p].primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(THEME_PRESET_SWATCHES[p].accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(MOTION_LEVELS).toEqual(['full', 'reduced', 'off']);
    expect(MOTION_DURATIONS.base).toBeGreaterThan(MOTION_DURATIONS.fast);
  });
});
