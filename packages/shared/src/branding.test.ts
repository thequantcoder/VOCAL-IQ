import { describe, expect, it } from 'vitest';
import { brandName, brandingToCssVars, darken, parseBranding } from './branding.js';

describe('parseBranding', () => {
  it('accepts valid branding and drops bad fields back to defaults', () => {
    const b = parseBranding({
      name: 'Acme Voice',
      primaryColor: '#ff0000',
      hidePlatformName: true,
    });
    expect(b.name).toBe('Acme Voice');
    expect(b.primaryColor).toBe('#ff0000');
    expect(b.hidePlatformName).toBe(true);
    // A bad colour makes the whole parse fall back to defaults (fail-safe).
    expect(parseBranding({ primaryColor: 'not-a-color' }).hidePlatformName).toBe(false);
  });
});

describe('brandingToCssVars', () => {
  it('maps set colours to the design-token vars and derives deep-violet', () => {
    const vars = brandingToCssVars(
      parseBranding({ primaryColor: '#7c5cff', accentColor: '#00d1b2' }),
    );
    expect(vars['--vq-violet']).toBe('#7c5cff');
    expect(vars['--vq-cyan']).toBe('#00d1b2');
    expect(vars['--vq-violet-deep']).toMatch(/^#[0-9a-f]{6}$/);
    expect(vars['--ring']).toBe('#7c5cff');
  });
  it('produces no overrides when no colours are set (defaults stay)', () => {
    expect(brandingToCssVars(parseBranding({}))).toEqual({});
  });
});

describe('brandName (no platform leak)', () => {
  it('uses the tenant brand, or VocalIQ, or nothing when the platform is hidden', () => {
    expect(brandName(parseBranding({ name: 'Acme' }))).toBe('Acme');
    expect(brandName(parseBranding({}))).toBe('VocalIQ');
    expect(brandName(parseBranding({ hidePlatformName: true }))).toBe(''); // white-label leak-proof
  });
});

describe('darken', () => {
  it('darkens a hex and expands shorthand', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080');
    expect(darken('#fff', 0.5)).toBe('#808080');
    expect(darken('#000000', 0.5)).toBe('#000000');
  });
});
