'use client';

import { Button, type ButtonProps } from '@vocaliq/ui';
import Link from 'next/link';
import { track } from '../lib/analytics';

/** A landing CTA that navigates + fires a PostHog conversion event (no-ops without analytics). */
export function TrackedCta({
  href,
  event,
  children,
  size = 'lg',
  variant = 'primary',
}: {
  href: string;
  event: string;
  children: React.ReactNode;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}) {
  const external = href.startsWith('mailto:') || href.startsWith('http');
  return (
    <Link
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={() => track(event)}
    >
      <Button size={size} variant={variant}>
        {children}
      </Button>
    </Link>
  );
}
