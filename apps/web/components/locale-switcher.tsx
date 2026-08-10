'use client';

import { LOCALES } from '@vocaliq/shared';
import { useI18n } from '../lib/i18n/provider';

/** Locale switcher (Day 68) — sets the UI language (persisted; RTL applied on <html>). */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="flex items-center gap-1 text-vq-text-lo text-xs">
      <span className="sr-only">{t('locale.label')}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        aria-label={t('locale.label')}
        className="rounded-vq border border-vq-border bg-vq-bg-base px-2 py-1 text-vq-text-hi text-xs"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
