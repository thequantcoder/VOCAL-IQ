'use client';

import { brandName, parseBranding } from '@vocaliq/shared';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../app/theme-toggle';
import { useBranding } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BrandingApplier } from './branding-applier';
import { ErrorBoundary } from './error-boundary';
import { LocaleSwitcher } from './locale-switcher';
import { RouteShell } from './route-shell';
import { MobileNav, SidebarNav } from './sidebar-nav';

/**
 * Dashboard app shell (DESIGN-SYSTEM §7): a grouped, animated sidebar on desktop (UX-07) that becomes
 * a hamburger + slide-in drawer on mobile, dark-mode toggle, and an error boundary around the routed
 * content so a failure in one view never blanks the whole app.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.memberships?.some((m) => m.role === 'SUPER_ADMIN') ?? false;
  const isReseller =
    user?.memberships?.some((m) => m.role === 'RESELLER_ADMIN' || m.role === 'SUPER_ADMIN') ??
    false;

  const branding = useBranding();
  const label = brandName(parseBranding(branding.data ?? {}));

  const brandMark = (
    <Link href="/dashboard" className="flex items-center gap-2 px-2">
      <span className="inline-block h-6 w-1.5 rounded-vq-pill bg-vq-violet" aria-hidden />
      {branding.data?.logoUrl ? (
        <img src={branding.data.logoUrl} alt={label || 'Logo'} className="h-6 w-auto" />
      ) : (
        label && <span className="font-display font-semibold text-vq-text-hi">{label}</span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-vq-bg-base text-vq-text-hi md:grid md:grid-cols-[240px_1fr]">
      {/* Apply the tenant's white-label theme (Day 52) across the whole shell. */}
      <BrandingApplier />
      {/* Desktop sidebar — grouped, animated, scrollable. Hidden on mobile (see the header hamburger). */}
      <aside className="hidden flex-col gap-5 border-vq-border p-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto md:border-r">
        {brandMark}
        <SidebarNav isReseller={isReseller} isSuperAdmin={isSuperAdmin} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center gap-3 border-vq-border border-b px-4 py-3 md:px-6">
          <MobileNav isReseller={isReseller} isSuperAdmin={isSuperAdmin} brand={brandMark} />
          <div className="flex flex-1 items-center justify-end gap-3">
            <LocaleSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        {/* Route transitions + a11y (UX-06): RouteShell crossfades content on navigation (framer, or the
            View Transitions API where supported) and manages SR announce / focus / scroll on route change.
            No `key` here — RouteShell owns the AnimatePresence so exits can play. */}
        <main className="min-w-0 flex-1 px-6 py-8">
          <ErrorBoundary>
            <RouteShell>{children}</RouteShell>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

/** The signed-in user's email + a sign-out control (replaces Clerk's UserButton). */
function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      {user?.email && (
        <span className="hidden text-sm text-vq-text-lo sm:inline">{user.email}</span>
      )}
      <button
        type="button"
        onClick={() => {
          signOut();
          router.push('/sign-in');
        }}
        className="flex items-center gap-1 rounded-vq border border-vq-border px-2.5 py-1.5 text-sm text-vq-text-lo hover:text-vq-text-hi"
      >
        <LogOut size={15} aria-hidden /> Sign out
      </button>
    </div>
  );
}
