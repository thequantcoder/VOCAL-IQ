'use client';

import { brandName, parseBranding } from '@vocaliq/shared';
import { cn } from '@vocaliq/ui';
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Flag,
  FlaskConical,
  Gauge,
  Headphones,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  LogOut,
  Megaphone,
  MessageSquare,
  Mic,
  Palette,
  PhoneCall,
  Plug,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../app/theme-toggle';
import { useBranding } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BrandingApplier } from './branding-applier';
import { ErrorBoundary } from './error-boundary';
import { LocaleSwitcher } from './locale-switcher';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/agents', label: 'Agents', icon: Bot, exact: false },
  { href: '/dashboard/calls', label: 'Calls', icon: PhoneCall, exact: false },
  { href: '/dashboard/desk', label: 'Agent Desk', icon: Headphones, exact: false },
  { href: '/dashboard/sentiment', label: 'Live sentiment', icon: Activity, exact: false },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, exact: false },
  { href: '/dashboard/intel', label: 'Conversation intel', icon: Lightbulb, exact: false },
  { href: '/dashboard/latency', label: 'Latency', icon: Gauge, exact: false },
  { href: '/dashboard/search', label: 'Search', icon: Search, exact: false },
  { href: '/dashboard/qa', label: 'QA scoring', icon: ClipboardCheck, exact: false },
  { href: '/dashboard/voices', label: 'Voices', icon: Mic, exact: false },
  { href: '/dashboard/squads', label: 'Squads', icon: Users, exact: false },
  { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone, exact: false },
  { href: '/dashboard/messaging', label: 'Messaging', icon: MessageSquare, exact: false },
  { href: '/dashboard/leads', label: 'Leads', icon: Target, exact: false },
  { href: '/dashboard/forms', label: 'Forms', icon: ClipboardList, exact: false },
  { href: '/dashboard/experiments', label: 'Experiments', icon: FlaskConical, exact: false },
  { href: '/dashboard/sip', label: 'SIP trunks', icon: Server, exact: false },
  { href: '/dashboard/reputation', label: 'Number health', icon: ShieldCheck, exact: false },
  { href: '/dashboard/appointments', label: 'Appointments', icon: CalendarCheck, exact: false },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Plug, exact: false },
  { href: '/dashboard/mcp', label: 'Tool servers', icon: Plug, exact: false },
  { href: '/dashboard/automations', label: 'Automations', icon: Workflow, exact: false },
  { href: '/dashboard/developers', label: 'Developers', icon: KeyRound, exact: false },
  { href: '/dashboard/settings/sso', label: 'SSO', icon: ShieldCheck, exact: false },
  { href: '/dashboard/settings/compliance', label: 'Compliance', icon: ShieldAlert, exact: false },
  { href: '/dashboard/support', label: 'Support', icon: LifeBuoy, exact: false },
  { href: '/dashboard/wallet', label: 'Wallet', icon: Wallet, exact: false },
] as const;

/** Reseller-operator (RESELLER_ADMIN) nav — provision + manage sub-tenants, white-label. */
const RESELLER_NAV = [
  { href: '/dashboard/reseller/dashboard', label: 'Revenue', icon: TrendingUp, exact: false },
  { href: '/dashboard/reseller', label: 'Sub-tenants', icon: Building2, exact: true },
  { href: '/dashboard/admin/plans', label: 'Plans', icon: Layers, exact: false },
  { href: '/dashboard/branding', label: 'White-label', icon: Palette, exact: false },
] as const;

/** Platform-operator (SUPER_ADMIN) nav — only shown to platform staff. */
const SUPER_ADMIN_NAV = [
  { href: '/dashboard/admin', label: 'Super-admin', icon: Shield, exact: true },
  { href: '/dashboard/admin/vault', label: 'Key vault', icon: Shield, exact: false },
  { href: '/dashboard/admin/key-pool', label: 'Key pool', icon: KeyRound, exact: false },
  { href: '/dashboard/admin/governance', label: 'Governance', icon: Flag, exact: false },
] as const;

/**
 * Dashboard app shell (DESIGN-SYSTEM §7): a sidebar on desktop that collapses to a top
 * bar on mobile, dark-mode toggle, and an error boundary around the routed content so a
 * failure in one view never blanks the whole app.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isSuperAdmin = user?.memberships?.some((m) => m.role === 'SUPER_ADMIN') ?? false;
  const isReseller =
    user?.memberships?.some((m) => m.role === 'RESELLER_ADMIN' || m.role === 'SUPER_ADMIN') ??
    false;
  const nav = [
    ...NAV,
    ...(isReseller ? RESELLER_NAV : []),
    ...(isSuperAdmin ? SUPER_ADMIN_NAV : []),
  ];
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const branding = useBranding();
  const label = brandName(parseBranding(branding.data ?? {}));

  return (
    <div className="min-h-screen bg-vq-bg-base text-vq-text-hi md:grid md:grid-cols-[220px_1fr]">
      {/* Apply the tenant's white-label theme (Day 52) across the whole shell. */}
      <BrandingApplier />
      <aside className="flex flex-col gap-6 border-vq-border border-b p-4 md:sticky md:top-0 md:h-screen md:border-r md:border-b-0">
        <Link href="/dashboard" className="flex items-center gap-2 px-2">
          <span className="inline-block h-6 w-1.5 rounded-vq-pill bg-vq-violet" aria-hidden />
          {branding.data?.logoUrl ? (
            <img src={branding.data.logoUrl} alt={label || 'Logo'} className="h-6 w-auto" />
          ) : (
            label && <span className="font-display font-semibold text-vq-text-hi">{label}</span>
          )}
        </Link>
        <nav className="flex gap-1 md:flex-col" aria-label="Primary">
          {nav.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-vq px-3 py-2 text-sm transition-colors duration-[120ms]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring',
                  active
                    ? 'bg-vq-violet/12 font-medium text-vq-text-hi'
                    : 'text-vq-text-lo hover:bg-vq-bg-elevated hover:text-vq-text-hi',
                )}
              >
                <Icon size={16} aria-hidden />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-end gap-3 border-vq-border border-b px-6 py-3">
          <LocaleSwitcher />
          <ThemeToggle />
          <UserMenu />
        </header>
        {/* `key={pathname}` remounts on navigation so the entrance replays as a page transition
            (reduced-motion-safe — `.vq-reveal` is gated on no-preference). */}
        <main key={pathname} className="vq-reveal min-w-0 flex-1 px-6 py-8">
          <ErrorBoundary>{children}</ErrorBoundary>
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
