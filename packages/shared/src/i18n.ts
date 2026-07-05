/**
 * UI internationalization (Day 68) — pure locale resolution, message lookup with English fallback,
 * and Intl-based formatting shared across web/api/email. This localizes the PRODUCT UI (labels,
 * dates, currency, emails) — distinct from an agent SPEAKING a language (Day 25). Keeping it pure
 * makes locale selection + formatting + fallback deterministic + testable, and lets the same
 * catalog drive the dashboard and transactional emails.
 */

export interface LocaleInfo {
  code: string;
  label: string;
  /** BCP-47 tag for Intl formatting. */
  intl: string;
  rtl: boolean;
}

/** Launch locales. Adding one = add an entry here + a catalog file (see docs/BUILD-LOG add-a-locale). */
export const LOCALES: LocaleInfo[] = [
  { code: 'en', label: 'English', intl: 'en-US', rtl: false },
  { code: 'es', label: 'Español', intl: 'es-ES', rtl: false },
  { code: 'hi', label: 'हिन्दी', intl: 'hi-IN', rtl: false },
  { code: 'ar', label: 'العربية', intl: 'ar-SA', rtl: true },
];

export const DEFAULT_LOCALE = 'en';
const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

export function isSupportedLocale(code: string): boolean {
  return BY_CODE.has(code);
}

export function localeInfo(code: string): LocaleInfo {
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_LOCALE)!;
}

export function isRtl(code: string): boolean {
  return localeInfo(code).rtl;
}

/**
 * Resolve the effective UI locale by precedence: an explicit user preference → the tenant default
 * → the browser's `Accept-Language` → the platform default. Only supported locales are honored
 * (others are skipped), so the UI never renders in a locale with no catalog.
 */
export function resolveLocale(prefs: {
  user?: string | null;
  tenant?: string | null;
  acceptLanguage?: string | null;
}): string {
  const candidates = [
    prefs.user,
    prefs.tenant,
    ...parseAcceptLanguage(prefs.acceptLanguage),
    DEFAULT_LOCALE,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const base = c.slice(0, 2).toLowerCase();
    if (isSupportedLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Parse an `Accept-Language` header into an ordered list of language codes (ignoring q-weights order-wise; header order is respected). */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => part.split(';')[0]!.trim())
    .filter(Boolean);
}

export type MessageCatalog = Record<string, string>;

/**
 * Look up a message key in a locale catalog, falling back to the English catalog, then to the key
 * itself (so a missing string is visible, never blank). `{name}`-style placeholders are
 * interpolated from `vars`.
 */
export function translate(
  catalog: MessageCatalog,
  fallback: MessageCatalog,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const template = catalog[key] ?? fallback[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

// ── Intl formatting ──────────────────────────────────────────────────────────

/** Format a minor-unit (cents) money amount in the locale's convention. */
export function formatMoneyMinor(cents: number, currency: string, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(localeInfo(locale).intl, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function formatNumber(value: number, locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(localeInfo(locale).intl).format(value);
}

/** Timezone-aware date/time formatting. */
export function formatDateTime(date: Date, locale = DEFAULT_LOCALE, timeZone?: string): string {
  return new Intl.DateTimeFormat(localeInfo(locale).intl, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
