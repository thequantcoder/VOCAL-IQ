'use client';

import { brandName, parseBranding } from '@vocaliq/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@vocaliq/ui';
import { LogOut, Palette, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../app/theme-toggle';
import { useBranding } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CommandPalette, openCommandPalette } from './command-palette';
import { ErrorBoundary } from './error-boundary';
import { LocaleSwitcher } from './locale-switcher';
import { NotificationCenter } from './notification-center';
import { RouteProgress } from './route-progress';
import { RouteShell } from './route-shell';
import { ShortcutsOverlay } from './shortcuts-overlay';
import { MobileNav, SidebarNav } from './sidebar-nav';
import { ThemeApplier } from './theme-applier';
import { TourOverlay } from './tour';

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
      <ThemeApplier />
      {/* Top route-progress bar (UX-15). */}
      <RouteProgress />
      {/* Desktop sidebar — grouped, animated, scrollable. Hidden on mobile (see the header hamburger). */}
      <aside
        data-tour="sidebar"
        className="hidden flex-col gap-5 border-vq-border p-4 md:sticky md:top-0 md:flex md:h-screen md:overflow-y-auto md:border-r"
      >
        {brandMark}
        <SidebarNav isReseller={isReseller} isSuperAdmin={isSuperAdmin} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center gap-3 border-vq-border border-b px-4 py-3 md:px-6">
          <MobileNav isReseller={isReseller} isSuperAdmin={isSuperAdmin} brand={brandMark} />
          {/* Command palette trigger (⌘K) — search-first entry to nav + quick actions. */}
          <button
            type="button"
            data-tour="search"
            onClick={openCommandPalette}
            className="flex items-center gap-2 rounded-vq border border-vq-border px-2.5 py-1.5 text-sm text-vq-text-lo transition-colors hover:border-vq-violet/50 hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring"
          >
            <Search size={15} aria-hidden />
            <span className="hidden sm:inline">Search…</span>
            <kbd className="hidden rounded-vq-sm border border-vq-border px-1.5 py-0.5 font-mono text-[0.65rem] sm:inline">
              ⌘K
            </kbd>
          </button>
          <div className="flex flex-1 items-center justify-end gap-2">
            <LocaleSwitcher />
            <NotificationCenter />
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

      {/* Global ⌘K command palette + product tour + shortcuts overlay (mounted once). */}
      <CommandPalette />
      <TourOverlay />
      <ShortcutsOverlay />
    </div>
  );
}

/** The signed-in user's account menu — Appearance + sign out (replaces Clerk's UserButton). */
function UserMenu() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-tour="account"
          className="flex items-center gap-2 rounded-vq border border-vq-border px-2.5 py-1.5 text-sm text-vq-text-lo transition-colors hover:border-vq-violet/50 hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring"
        >
          <UserRound size={15} aria-hidden />
          {user?.email && <span className="hidden max-w-40 truncate sm:inline">{user.email}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {user?.email && <DropdownMenuLabel>{user.email}</DropdownMenuLabel>}
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings/appearance">
            <Palette size={15} /> Appearance
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={() => {
            signOut();
            router.push('/sign-in');
          }}
        >
          <LogOut size={15} /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
