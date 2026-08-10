import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, THEME_PRESET_SWATCHES } from './theme';
import {
  RAMP_STEPS,
  contrastRatio,
  hexToRgb,
  luminance,
  ramp,
  readableForeground,
  resolveTheme,
  rgbToHex,
  themeToCssVars,
} from './theme-runtime';

describe('colour maths', () => {
  it('round-trips hex ↔ rgb', () => {
    expect(hexToRgb('#7c5cff')).toEqual([124, 92, 255]);
    expect(rgbToHex([124, 92, 255])).toBe('#7c5cff');
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('computes luminance + contrast (WCAG)', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
    expect(luminance([0, 0, 0])).toBeCloseTo(0, 5);
    // white on black is the maximum 21:1
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 1);
  });
});

describe('readableForeground (AA guardrail)', () => {
  it('picks white on dark brand + ink on light', () => {
    expect(readableForeground('#7c5cff')).toBe('#ffffff'); // violet → white
    expect(readableForeground('#22d3ee')).toBe('#0b0b12'); // cyan → dark ink
    expect(readableForeground('#111827')).toBe('#ffffff'); // ink → white
  });

  it('meets the 3:1 UI/large-text AA threshold against the chosen fg for every preset base', () => {
    // Text ON the brand (button/badge labels) is large/bold → WCAG AA is 3:1 for those.
    for (const { primary, accent } of Object.values(THEME_PRESET_SWATCHES)) {
      for (const c of [primary, accent]) {
        const fg = readableForeground(c);
        expect(contrastRatio(hexToRgb(c), hexToRgb(fg))).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('ramp', () => {
  it('produces all 10 steps with 500 = the exact base', () => {
    const r = ramp('#7c5cff');
    expect(Object.keys(r)).toHaveLength(10);
    expect(r[500]).toBe('#7c5cff');
    for (const step of RAMP_STEPS) expect(r[step]).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('is monotonically darker from 50 → 900', () => {
    const r = ramp('#3b82f6');
    const lums = RAMP_STEPS.map((s) => luminance(hexToRgb(r[s] as string)));
    for (let i = 1; i < lums.length; i++) {
      expect(lums[i]).toBeLessThan(lums[i - 1] as number);
    }
  });
});

describe('resolveTheme (platform → reseller → user)', () => {
  it('falls back to the preset swatch with no overrides', () => {
    const t = resolveTheme({});
    expect(t.preset).toBe('nebula');
    expect(t.primary).toBe(THEME_PRESET_SWATCHES.nebula.primary);
  });

  it('switches base colours when the user picks a preset', () => {
    const t = resolveTheme({ user: { preset: 'ocean' } });
    expect(t.primary).toBe(THEME_PRESET_SWATCHES.ocean.primary);
  });

  it('user custom colours override the preset', () => {
    const t = resolveTheme({ user: { colors: { primary: '#ff0000' } } });
    expect(t.primary).toBe('#ff0000');
  });

  it('reseller branding overrides the preset but the user overrides the reseller', () => {
    const resellerOnly = resolveTheme({ reseller: { primary: '#00ff00' } });
    expect(resellerOnly.primary).toBe('#00ff00');
    const userWins = resolveTheme({
      reseller: { primary: '#00ff00' },
      user: { colors: { primary: '#0000ff' } },
    });
    expect(userWins.primary).toBe('#0000ff');
  });

  it('lockBranding pins reseller colour but keeps user radius/density', () => {
    const t = resolveTheme({
      reseller: { primary: '#00ff00', lockBranding: true },
      user: { colors: { primary: '#0000ff' }, radius: 'round', density: 'compact' },
    });
    expect(t.primary).toBe('#00ff00'); // pinned
    expect(t.radius).toBe('round'); // still user's
    expect(t.density).toBe('compact');
  });

  it('carries the non-colour prefs from the user', () => {
    const t = resolveTheme({ user: { motion: 'reduced', font: 'mono', mode: 'dark' } });
    expect(t.motion).toBe('reduced');
    expect(t.font).toBe('mono');
    expect(t.mode).toBe('dark');
  });
});

describe('themeToCssVars', () => {
  it('emits the full scale + fg + radius + density + back-compat aliases', () => {
    const vars = themeToCssVars(resolveTheme({}));
    expect(vars['--primary-500']).toBe(THEME_PRESET_SWATCHES.nebula.primary);
    expect(vars['--primary-fg']).toBe('#ffffff');
    expect(vars['--accent-500']).toBe(THEME_PRESET_SWATCHES.nebula.accent);
    expect(vars['--radius']).toBeTruthy();
    expect(vars['--density']).toBe('1');
    expect(vars['--vq-violet']).toBe(vars['--primary-500']);
    expect(vars['--vq-cyan']).toBe(vars['--accent-500']);
  });

  it('reflects radius + density choices', () => {
    const vars = themeToCssVars(resolveTheme({ user: { radius: 'round', density: 'compact' } }));
    expect(vars['--radius']).toBe('1rem');
    expect(vars['--density']).toBe('0.82');
  });

  it('the default theme resolves without throwing', () => {
    expect(() => themeToCssVars(resolveTheme({ platformDefault: DEFAULT_THEME }))).not.toThrow();
  });
});
