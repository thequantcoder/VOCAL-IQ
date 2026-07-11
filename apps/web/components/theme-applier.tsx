'use client';

import { parseBranding, resolveTheme, themeToCssVars } from '@vocaliq/shared';
import { useEffect } from 'react';
import { useBranding } from '../lib/api';
import { useUserTheme } from '../lib/theme-store';

/**
 * ThemeApplier (UX-12) — the runtime that resolves the effective theme (**platform default → reseller
 * white-label → per-user**) and writes the full UX-02 token set on `:root`, so every `bg-primary-*` /
 * `bg-vq-*` utility re-skins at once, in both light + dark. Extends the Day-52 BrandingApplier: it folds
 * the reseller's brand colours into `resolveTheme`, layers the user's preset/custom colours/radius/
 * density on top, and derives all 50–900 ramps + AA `-fg` at runtime. Also swaps the favicon. Renders
 * nothing. (DB persistence + no-FOUC SSR inline land in UX-12b.)
 */
export function ThemeApplier() {
  const branding = useBranding();
  const userTheme = useUserTheme();

  useEffect(() => {
    const root = document.documentElement;
    const b = parseBranding(branding.data ?? {});

    const resolved = resolveTheme({
      user: userTheme,
      reseller: {
        ...(b.primaryColor ? { primary: b.primaryColor } : {}),
        ...(b.accentColor ? { accent: b.accentColor } : {}),
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
