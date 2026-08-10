'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Region-aware cookie-consent banner (Day 60). Gates analytics until the visitor consents:
 * PostHog/analytics init should check `hasAnalyticsConsent()`. Choice is persisted in a
 * first-party cookie (not localStorage) so it survives + is readable server-side if needed.
 */
const COOKIE = 'vq_consent';

function readConsent(): 'all' | 'essential' | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)vq_consent=(all|essential)/);
  return m ? (m[1] as 'all' | 'essential') : null;
}

function writeConsent(value: 'all' | 'essential') {
  // 12-month first-party cookie.
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

/** Read the analytics-consent decision (for gating PostHog etc.). */
export function hasAnalyticsConsent(): boolean {
  return readConsent() === 'all';
}

export function CookieConsent() {
  const [decided, setDecided] = useState(true);

  useEffect(() => {
    setDecided(readConsent() !== null);
  }, []);

  if (decided) return null;

  function choose(value: 'all' | 'essential') {
    writeConsent(value);
    setDecided(true);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-vq-border border-t bg-vq-surface-2/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-vq-text-lo">
          We use essential cookies to run VocalIQ and, with your consent, analytics to improve it.
          See our{' '}
          <Link href="/privacy" className="text-vq-brand underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose('essential')}
            className="rounded-vq border border-vq-border px-3 py-1.5 text-sm text-vq-text-hi hover:bg-vq-bg-base"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose('all')}
            className="rounded-vq bg-vq-brand px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
