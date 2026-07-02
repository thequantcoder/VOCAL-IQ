import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

/*
 * Type pairing per DESIGN-SYSTEM.md §2: a characterful geometric display face,
 * a clean body face, and a mono face for data/transcripts. "General Sans"/"Clash"
 * aren't on Google Fonts, so we substitute Space Grotesk (geometric, characterful)
 * for display — never Inter-as-display (§2). See BUILD-LOG Day 01.
 */
const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'VocalIQ — AI that picks up the phone',
  description: 'Multi-tenant, white-label Agentic Voice AI SaaS.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>
        {/* Providers wraps the app with the self-hosted auth context (JWT), theming, and
            the data layer, so auth is available to every route. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
