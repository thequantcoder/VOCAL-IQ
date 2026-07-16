'use client';

import { Sheet, SheetContent, SheetTrigger, cn } from '@vocaliq/ui';
import { Collapse, m, useMotionLevel } from '@vocaliq/ui/motion';
import {
  Activity,
  BarChart3,
  Bell,
  Blocks,
  Bot,
  BrainCircuit,
  Building2,
  CalendarCheck,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Database,
  Fingerprint,
  Flag,
  FlaskConical,
  Gauge,
  Hash,
  Headphones,
  KeyRound,
  Languages,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  Lightbulb,
  type LucideIcon,
  Megaphone,
  Menu,
  MessageSquare,
  Mic,
  Palette,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Plug,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smile,
  Store,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  UserSquare2,
  Users,
  Wallet,
  Waypoints,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  /** Role gate — only shown to matching operators. */
  role?: 'reseller' | 'admin';
}

/** Pinned above the groups — the home surface. */
const OVERVIEW: NavItem = {
  href: '/dashboard',
  label: 'Overview',
  icon: LayoutDashboard,
  exact: true,
};

/** The long nav, grouped into scannable sections (UX-07). Order within a group is task-flow order. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'build',
    label: 'Build',
    items: [
      { href: '/dashboard/agents', label: 'Agents', icon: Bot },
      { href: '/dashboard/squads', label: 'Squads', icon: Users },
      { href: '/dashboard/voices', label: 'Voices', icon: Mic },
      { href: '/dashboard/voice-emotion', label: 'Voice emotion', icon: Smile },
      { href: '/dashboard/avatars', label: 'Video avatars', icon: UserSquare2 },
      { href: '/dashboard/models', label: 'Custom models', icon: BrainCircuit },
      { href: '/dashboard/workflows', label: 'Workflows', icon: Waypoints },
      { href: '/dashboard/forms', label: 'Forms', icon: ClipboardList },
      { href: '/dashboard/experiments', label: 'Experiments', icon: FlaskConical },
    ],
  },
  {
    id: 'run',
    label: 'Run',
    items: [
      { href: '/dashboard/calls', label: 'Calls', icon: PhoneCall },
      { href: '/dashboard/phone-numbers', label: 'Phone numbers', icon: Hash },
      { href: '/dashboard/desk', label: 'Agent Desk', icon: Headphones },
      { href: '/dashboard/copilot', label: 'Live Co-Pilot', icon: Swords },
      { href: '/dashboard/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/dashboard/callbacks', label: 'Callbacks', icon: PhoneOutgoing },
      { href: '/dashboard/messaging', label: 'Messaging', icon: MessageSquare },
      { href: '/dashboard/sip', label: 'SIP trunks', icon: Server },
      { href: '/dashboard/appointments', label: 'Appointments', icon: CalendarCheck },
      { href: '/dashboard/settings/translation', label: 'Translation', icon: Languages },
      { href: '/dashboard/sentiment', label: 'Live sentiment', icon: Activity },
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    items: [
      { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/dashboard/benchmarking', label: 'Benchmarking', icon: Trophy },
      { href: '/dashboard/intel', label: 'Conversation intel', icon: Lightbulb },
      { href: '/dashboard/qa', label: 'QA scoring', icon: ClipboardCheck },
      { href: '/dashboard/latency', label: 'Latency', icon: Gauge },
      { href: '/dashboard/search', label: 'Search', icon: Search },
      { href: '/dashboard/exports', label: 'BI exports', icon: Database },
      { href: '/dashboard/revenue', label: 'Revenue', icon: TrendingUp },
    ],
  },
  {
    id: 'grow',
    label: 'Grow',
    items: [
      { href: '/dashboard/leads', label: 'Leads', icon: Target },
      { href: '/dashboard/reputation', label: 'Number health', icon: ShieldCheck },
      { href: '/dashboard/payments', label: 'Payments', icon: CreditCard },
      { href: '/dashboard/integrations', label: 'Integrations', icon: Plug },
      { href: '/dashboard/mcp', label: 'Tool servers', icon: Plug },
      { href: '/dashboard/automations', label: 'Automations', icon: Workflow },
      { href: '/dashboard/developers', label: 'Developers', icon: KeyRound },
      { href: '/dashboard/marketplace', label: 'Marketplace', icon: Store },
      { href: '/dashboard/apps', label: 'Apps', icon: Blocks },
      { href: '/dashboard/outcomes', label: 'Outcome billing', icon: Target },
      { href: '/dashboard/wallet', label: 'Wallet', icon: Wallet },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { href: '/dashboard/settings/appearance', label: 'Appearance', icon: Palette },
      { href: '/dashboard/settings/notifications', label: 'Notifications', icon: Bell },
      {
        href: '/dashboard/settings/whatsapp-calling',
        label: 'WhatsApp Calling',
        icon: PhoneIncoming,
      },
      { href: '/dashboard/settings/sso', label: 'SSO', icon: ShieldCheck },
      { href: '/dashboard/settings/compliance', label: 'Compliance', icon: ShieldAlert },
      { href: '/dashboard/settings/biometrics', label: 'Voice biometrics', icon: Fingerprint },
      { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
    ],
  },
  {
    id: 'reseller',
    label: 'Reseller',
    role: 'reseller',
    items: [
      { href: '/dashboard/reseller/dashboard', label: 'Revenue', icon: TrendingUp },
      { href: '/dashboard/reseller', label: 'Sub-tenants', icon: Building2, exact: true },
      { href: '/dashboard/admin/plans', label: 'Plans', icon: Layers },
      { href: '/dashboard/branding', label: 'White-label', icon: Palette },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    role: 'admin',
    items: [
      { href: '/dashboard/admin', label: 'Super-admin', icon: Shield, exact: true },
      { href: '/dashboard/admin/vault', label: 'Key vault', icon: Shield },
      { href: '/dashboard/admin/key-pool', label: 'Key pool', icon: KeyRound },
      { href: '/dashboard/admin/governance', label: 'Governance', icon: Flag },
    ],
  },
];

/** The pinned Overview item, exported for consumers (e.g. the command palette). */
export const OVERVIEW_ITEM = OVERVIEW;

/** Flat list of every nav destination visible to the given roles — used by the ⌘K command palette. */
export function flatNavItems(isReseller: boolean, isSuperAdmin: boolean): NavItem[] {
  const groups = NAV_GROUPS.filter(
    (g) => !g.role || (g.role === 'reseller' && isReseller) || (g.role === 'admin' && isSuperAdmin),
  );
  return [OVERVIEW, ...groups.flatMap((g) => g.items)];
}

const SECTIONS_KEY = 'vq-nav-sections';

function matchActive(pathname: string, item: NavItem): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Persisted per-section open state; a section defaults open when it holds the active route. */
function useOpenSections(activeGroupId: string | null) {
  const [stored, setStored] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SECTIONS_KEY);
      if (raw) setStored(JSON.parse(raw));
    } catch {
      /* ignore malformed / unavailable storage */
    }
  }, []);

  const isOpen = useCallback(
    (id: string) => stored[id] ?? id === activeGroupId,
    [stored, activeGroupId],
  );

  const toggle = useCallback(
    (id: string) => {
      setStored((prev) => {
        const next = { ...prev, [id]: !(prev[id] ?? id === activeGroupId) };
        try {
          localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [activeGroupId],
  );

  return { isOpen, toggle };
}

function NavLink({
  item,
  active,
  onNavigate,
  indicatorId,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  indicatorId: string;
}) {
  const { animate } = useMotionLevel();
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-vq px-3 py-2 text-sm transition-colors duration-[120ms]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring',
        active
          ? 'font-medium text-vq-text-hi'
          : 'text-vq-text-lo hover:bg-vq-bg-elevated hover:text-vq-text-hi',
      )}
    >
      {/* Sliding active indicator — one shared layoutId pill glides between items (domMax). */}
      {active &&
        (animate ? (
          <m.span
            layoutId={indicatorId}
            className="absolute inset-0 rounded-vq bg-vq-violet/12"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          />
        ) : (
          <span className="absolute inset-0 rounded-vq bg-vq-violet/12" />
        ))}
      <span
        className={cn(
          'relative z-10 grid place-items-center transition-transform duration-150 group-hover:scale-110',
          active && 'text-vq-violet',
        )}
      >
        <Icon size={16} aria-hidden />
      </span>
      <span className="relative z-10 truncate">{item.label}</span>
    </Link>
  );
}

function NavSection({
  group,
  pathname,
  open,
  onToggle,
  onNavigate,
  indicatorId,
}: {
  group: NavGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  indicatorId: string;
}) {
  const hasActive = group.items.some((i) => matchActive(pathname, i));
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex items-center justify-between rounded-vq px-3 py-1.5 font-medium text-[0.7rem] uppercase tracking-wide transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring',
          hasActive ? 'text-vq-violet' : 'text-vq-text-lo hover:text-vq-text-hi',
        )}
      >
        {group.label}
        <ChevronDown
          size={14}
          aria-hidden
          className={cn('transition-transform duration-200', open ? 'rotate-0' : '-rotate-90')}
        />
      </button>
      <Collapse open={open}>
        <div className="mt-0.5 flex flex-col gap-0.5 pb-1">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={matchActive(pathname, item)}
              onNavigate={onNavigate}
              indicatorId={indicatorId}
            />
          ))}
        </div>
      </Collapse>
    </div>
  );
}

/**
 * Grouped, animated primary nav (UX-07). ~50 destinations organised into collapsible sections with a
 * single sliding active indicator (`layoutId`), icon hover micro-interactions, and per-section open
 * state persisted per browser. Rendered in the desktop sidebar and (via `onNavigate`) the mobile drawer.
 * `indicatorId` namespaces the sliding pill so the desktop + mobile instances don't fight over one id.
 */
export function SidebarNav({
  isReseller,
  isSuperAdmin,
  onNavigate,
  indicatorId = 'nav-active',
}: {
  isReseller: boolean;
  isSuperAdmin: boolean;
  onNavigate?: () => void;
  indicatorId?: string;
}) {
  const pathname = usePathname();

  const groups = useMemo(
    () =>
      NAV_GROUPS.filter(
        (g) =>
          !g.role || (g.role === 'reseller' && isReseller) || (g.role === 'admin' && isSuperAdmin),
      ),
    [isReseller, isSuperAdmin],
  );

  const activeGroupId =
    groups.find((g) => g.items.some((i) => matchActive(pathname, i)))?.id ?? null;
  const { isOpen, toggle } = useOpenSections(activeGroupId);

  const overviewActive = matchActive(pathname, OVERVIEW);

  return (
    <nav className="flex flex-col gap-1" aria-label="Primary">
      <NavLink
        item={OVERVIEW}
        active={overviewActive}
        onNavigate={onNavigate}
        indicatorId={indicatorId}
      />
      {groups.map((group) => (
        <NavSection
          key={group.id}
          group={group}
          pathname={pathname}
          open={isOpen(group.id)}
          onToggle={() => toggle(group.id)}
          onNavigate={onNavigate}
          indicatorId={indicatorId}
        />
      ))}
    </nav>
  );
}

/**
 * Mobile nav drawer (UX-07) — a hamburger that opens the grouped nav in a left `Sheet` (focus-trap +
 * scroll-lock from Radix). Closes on navigation. Uses a separate `indicatorId` so its sliding pill is
 * independent of the desktop sidebar's.
 */
export function MobileNav({
  isReseller,
  isSuperAdmin,
  brand,
}: {
  isReseller: boolean;
  isSuperAdmin: boolean;
  brand?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger — closing on nav is the intent.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="grid size-9 place-items-center rounded-vq text-vq-text-lo transition-colors hover:bg-vq-bg-elevated hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring md:hidden"
        >
          <Menu size={18} aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-4">
        {brand ? <div className="pr-8">{brand}</div> : null}
        <SidebarNav
          isReseller={isReseller}
          isSuperAdmin={isSuperAdmin}
          onNavigate={() => setOpen(false)}
          indicatorId="nav-active-mobile"
        />
      </SheetContent>
    </Sheet>
  );
}
