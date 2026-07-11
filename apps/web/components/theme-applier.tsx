'use client';

import { parseBranding, resolveTheme, themeToCssVars } from '@vocaliq/shared';
import { useEffect } from 'react';
import { useBranding } from '../lib/api';
import { useAuth } from '../lib/auth';
import { registerThemePersister, useUserTheme } from '../lib/theme-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
/** Snapshot of the applied CSS vars, read by the no-FOUC inline script on the next boot. */
const VARS_CACHE_KEY = 'vq-theme-vars';

/**
 * ThemeApplier (UX-12) — the runtime that resolves the effective theme (**platform default → reseller
 * white-label → per-user**) and writes the full UX-02 token set on `:root`, so every `bg-primary-*` /
 * `bg-vq-*` utility re-skins at once, in both light + dark. Subsumes the Day-52 BrandingApplier: it folds
 * the reseller's brand colours (+ `lockBranding`) into `resolveTheme`, layers the user's preset/custom
 * colours/radius/density on top, derives all 50–900 ramps + AA `-fg`, swaps the favicon, and caches the
 * resolved vars so the boot inline script can paint them before hydration (no FOUC). It also registers
 * the server-persister so user-initiated theme changes PUT to `/auth/me/theme`. Renders nothing.
 */
export function ThemeApplier() {
  const branding = useBranding();
  const userTheme = useUserTheme();
  const { getToken } = useAuth();

  // Register the server persister (user changes → PUT). Fire-and-forget; local storage is the source
  // of truth for instant apply, the server is the durable copy synced across devices.
  useEffect(() => {
    registerThemePersister((theme) => {
      void getToken().then((token) => {
        if (!token) return;
        void fetch(`${API_URL}/auth/me/theme`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(theme),
        }).catch(() => {});
      });
    });
    return () => registerThemePersister(null);
  }, [getToken]);

  useEffect(() => {
    const root = document.documentElement;
    const b = parseBranding(branding.data ?? {});

    const resolved = resolveTheme({
      user: userTheme,
      reseller: {
        ...(b.primaryColor ? { primary: b.primaryColor } : {}),
        ...(b.accentColor ? { accent: b.accentColor } : {}),
        lockBranding: b.lockBranding,
      },
    });

    const vars = themeToCssVars(resolved);
    // Legacy compat tokens the app still references (hover + focus ring).
    vars['--vq-violet-deep'] = vars['--primary-700'] as string;
    vars['--ring'] = vars['--primary-500'] as string;

    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    // Reflect density/font as data-attributes for any CSS that keys off them.
    root.dataset.density = resolved.density;
    root.dataset.font = resolved.font;

    // Cache for the next boot's no-FOUC inline paint (see app/layout.tsx).
    try {
      localStorage.setItem(VARS_CACHE_KEY, JSON.stringify(vars));
    } catch {
      /* storage unavailable — the effect above already applied the vars */
    }

    if (b.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = b.faviconUrl;
    }
  }, [branding.data, userTheme]);

  return null;
}
