import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { CookieConsent } from '../components/cookie-consent';
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

const SITE_TITLE = 'VocalIQ — AI that picks up the phone';
const SITE_DESC =
  'Design an AI voice agent, put it on a number, and let it sell, support, and book — inbound and outbound, in any language, on every channel. White-label & self-hostable.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vocaliq.dev'),
  title: { default: SITE_TITLE, template: '%s · VocalIQ' },
  description: SITE_DESC,
  applicationName: 'VocalIQ',
  keywords: [
    'AI voice agent',
    'voice AI',
    'agentic voice AI',
    'AI phone agent',
    'white-label voice AI',
    'conversational AI',
  ],
  openGraph: {
    type: 'website',
    siteName: 'VocalIQ',
    title: SITE_TITLE,
    description: SITE_DESC,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
  },
};

/**
 * No-FOUC theme paint (UX-12b): a blocking inline script that applies the previously-cached theme CSS
 * vars on `:root` before first paint, so a persisted custom/preset theme never flashes the default.
 * ThemeApplier refreshes the cache on every change; this just replays it. Fails silent.
 */
const THEME_BOOT = `try{var v=JSON.parse(localStorage.getItem('vq-theme-vars')||'{}');var r=document.documentElement;for(var k in v){r.style.setProperty(k,v[k])}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, self-authored no-FOUC boot script (no user input). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        {/* Providers wraps the app with the self-hosted auth context (JWT), theming, and
            the data layer, so auth is available to every route. */}
        <Providers>{children}</Providers>
        <CookieConsent />
      </body>
    </html>
  );
}
