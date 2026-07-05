import type { MessageCatalog } from '@vocaliq/shared';

/**
 * UI message catalogs (Day 68). `en` is the base/source-of-truth; other locales are partial and
 * fall back to English per key (see `translate`). Hand these files to translators (or a TMS like
 * Crowdin/Locize). To add a locale: add its LocaleInfo in shared/i18n.ts + a catalog entry here.
 */
export const catalogs: Record<string, MessageCatalog> = {
  en: {
    'nav.agents': 'Agents',
    'nav.calls': 'Calls',
    'nav.desk': 'Agent Desk',
    'nav.analytics': 'Analytics',
    'nav.wallet': 'Wallet',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.loading': 'Loading…',
    'locale.label': 'Language',
    'wallet.balance': 'Balance',
    'greeting.welcome': 'Welcome back, {name}',
  },
  es: {
    'nav.agents': 'Agentes',
    'nav.calls': 'Llamadas',
    'nav.desk': 'Mesa de agentes',
    'nav.analytics': 'Analítica',
    'nav.wallet': 'Cartera',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.loading': 'Cargando…',
    'locale.label': 'Idioma',
    'wallet.balance': 'Saldo',
    'greeting.welcome': 'Bienvenido de nuevo, {name}',
  },
  hi: {
    'nav.agents': 'एजेंट',
    'nav.calls': 'कॉल',
    'common.save': 'सहेजें',
    'common.cancel': 'रद्द करें',
    'locale.label': 'भाषा',
  },
  ar: {
    'nav.agents': 'الوكلاء',
    'nav.calls': 'المكالمات',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'locale.label': 'اللغة',
  },
};
