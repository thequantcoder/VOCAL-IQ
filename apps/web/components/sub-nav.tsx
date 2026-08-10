'use client';

import { cn } from '@vocaliq/ui';
import { m, useMotionLevel } from '@vocaliq/ui/motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface SubNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

/**
 * Contextual sub-navigation (UX-07) — a horizontal secondary nav (e.g. an agent's Builder / Chat /
 * Guards tabs) with the same sliding active indicator as the primary nav: one `layoutId` underline
 * glides between tabs (spring, via domMax). Reduced-motion → static underline. Real `<Link>`s, so it
 * composes with the route transitions + is keyboard/AT accessible.
 */
export function SubNav({
  items,
  layoutId = 'subnav-active',
  className,
}: {
  items: SubNavItem[];
  layoutId?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { animate } = useMotionLevel();
  return (
    <nav
      aria-label="Section"
      className={cn('flex items-center gap-1 overflow-x-auto border-vq-border border-b', className)}
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative whitespace-nowrap px-3 py-2 font-medium text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring',
              active ? 'text-primary-500' : 'text-vq-text-lo hover:text-vq-text-hi',
            )}
          >
            {item.label}
            {active &&
              (animate ? (
                <m.span
                  layoutId={layoutId}
                  className="absolute inset-x-2 bottom-[-1px] h-0.5 rounded-vq-pill bg-primary-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              ) : (
                <span className="absolute inset-x-2 bottom-[-1px] h-0.5 rounded-vq-pill bg-primary-500" />
              ))}
          </Link>
        );
      })}
    </nav>
  );
}
