import { describe, expect, it } from 'vitest';
import {
  formatMoneyMinor,
  isRtl,
  isSupportedLocale,
  parseAcceptLanguage,
  resolveLocale,
  translate,
} from './i18n.js';

describe('locale support', () => {
  it('knows supported locales + RTL', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('ar')).toBe(true);
    expect(isSupportedLocale('zz')).toBe(false);
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
  });
});

describe('resolveLocale (precedence user > tenant > accept-language > default)', () => {
  it('prefers the user preference', () => {
    expect(resolveLocale({ user: 'es', tenant: 'hi', acceptLanguage: 'ar' })).toBe('es');
  });
  it('falls to the tenant default when no user pref', () => {
    expect(resolveLocale({ user: null, tenant: 'hi' })).toBe('hi');
  });
  it('uses Accept-Language next', () => {
    expect(resolveLocale({ acceptLanguage: 'fr-FR,ar;q=0.8' })).toBe('ar'); // fr unsupported → ar
  });
  it('defaults to English for unsupported everything', () => {
    expect(resolveLocale({ user: 'zz', tenant: 'qq', acceptLanguage: 'jp' })).toBe('en');
  });
  it('normalizes region suffixes (es-MX → es)', () => {
    expect(resolveLocale({ user: 'es-MX' })).toBe('es');
  });
});

describe('parseAcceptLanguage', () => {
  it('extracts ordered codes, dropping q-weights', () => {
    expect(parseAcceptLanguage('en-US,es;q=0.9,ar;q=0.5')).toEqual(['en-US', 'es', 'ar']);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });
});

describe('translate (English fallback + interpolation)', () => {
  const en = { greeting: 'Hello {name}', bye: 'Goodbye' };
  const es = { greeting: 'Hola {name}' };
  it('uses the locale catalog with interpolation', () => {
    expect(translate(es, en, 'greeting', { name: 'Ana' })).toBe('Hola Ana');
  });
  it('falls back to English for a missing key', () => {
    expect(translate(es, en, 'bye')).toBe('Goodbye');
  });
  it('falls back to the key itself when absent everywhere (never blank)', () => {
    expect(translate(es, en, 'unknown.key')).toBe('unknown.key');
  });
});

describe('formatMoneyMinor (locale + currency)', () => {
  it('formats cents per locale', () => {
    expect(formatMoneyMinor(9900, 'USD', 'en')).toContain('99');
    expect(formatMoneyMinor(9900, 'USD', 'en')).toContain('$');
    // es-ES uses € grouping — just assert it produced a euro amount.
    expect(formatMoneyMinor(150000, 'EUR', 'es')).toContain('€');
  });
});
