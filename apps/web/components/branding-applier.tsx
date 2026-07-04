'use client';

import { brandingToCssVars, parseBranding } from '@vocaliq/shared';
import { useEffect } from 'react';
import { useBranding } from '../lib/api';

/**
 * Applies the tenant's white-label branding (Day 52) by writing its design-token CSS variables
 * onto the document root — so every `bg-vq-*`/`text-vq-*` utility re-themes at once, in both
 * light + dark. Reverts to the defaults when branding is cleared/unavailable. Also swaps the
 * favicon when the tenant sets one. Renders nothing.
 */
export function BrandingApplier() {
  const branding = useBranding();

  useEffect(() => {
    const root = document.documentElement;
    const b = parseBranding(branding.data ?? {});
    const vars = brandingToCssVars(b);
    const keys = ['--vq-violet', '--vq-violet-deep', '--vq-cyan', '--ring'];
    // Apply set overrides; clear any we don't set so removing a brand reverts cleanly.
    for (const k of keys) {
      if (vars[k]) root.style.setProperty(k, vars[k]);
      else root.style.removeProperty(k);
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
  }, [branding.data]);

  return null;
}
