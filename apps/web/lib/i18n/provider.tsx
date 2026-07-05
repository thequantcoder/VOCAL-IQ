'use client';

import { DEFAULT_LOCALE, isRtl, isSupportedLocale, translate } from '@vocaliq/shared';
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { catalogs } from './catalogs';

/**
 * Dependency-free i18n provider (Day 68). Holds the active locale (persisted in a first-party
 * `vq_locale` cookie), exposes `t()` with English fallback, and sets `dir`/`lang` on <html> for
 * RTL. A tenant default cascades in via the initial cookie; users can switch.
 */
interface I18nValue {
  locale: string;
  dir: 'ltr' | 'rtl';
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (code: string) => void;
}

const I18nContext = createContext<I18nValue | null>(null);
const COOKIE = 'vq_locale';

function readCookie(): string {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  const m = document.cookie.match(/(?:^|;\s*)vq_locale=([a-z]{2})/);
  return m && isSupportedLocale(m[1]!) ? m[1]! : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(readCookie());
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtl(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const cat = catalogs[locale] ?? {};
    const en = catalogs.en ?? {};
    return {
      locale,
      dir: isRtl(locale) ? 'rtl' : 'ltr',
      t: (key, vars) => translate(cat, en, key, vars),
      setLocale: (code) => {
        if (!isSupportedLocale(code)) return;
        document.cookie = `${COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        setLocaleState(code);
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
