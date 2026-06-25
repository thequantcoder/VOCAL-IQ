'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { initPostHog } from '../lib/analytics';

/**
 * App-shell providers. Dark-first theming (DESIGN-SYSTEM §1) via next-themes,
 * plus product analytics that no-op cleanly when no key is configured.
 */
export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
