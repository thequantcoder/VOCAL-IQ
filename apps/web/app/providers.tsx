'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionProvider } from '@vocaliq/ui/motion';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useEffect, useState } from 'react';
import { initPostHog } from '../lib/analytics';
import { AuthProvider } from '../lib/auth';
import { I18nProvider } from '../lib/i18n/provider';

/**
 * App-shell providers. Self-hosted auth context (JWT), dark-first theming (DESIGN-SYSTEM
 * §1) via next-themes, TanStack Query for server state (the dashboard's data layer), plus
 * product analytics that no-op cleanly when no key is configured.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <MotionProvider>
          <AuthProvider>
            <I18nProvider>{children}</I18nProvider>
          </AuthProvider>
        </MotionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
