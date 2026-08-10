'use client';

import { THEME_PRESETS } from '@vocaliq/shared';
import { cn } from '@vocaliq/ui';
import { AnimatePresence, m, useMotionLevel } from '@vocaliq/ui/motion';
import {
  Compass,
  CornerDownLeft,
  Gauge,
  ListChecks,
  Moon,
  Palette,
  PhoneOutgoing,
  Plus,
  Search,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { openOnboarding } from '../lib/onboarding-store';
import { setUserTheme, useUserTheme } from '../lib/theme-store';
import { flatNavItems } from './sidebar-nav';
import { startTour } from './tour';

/** Fire from anywhere to open the palette (e.g. the header search button). */
export function openCommandPalette() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vq-open-command'));
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: 'Actions' | 'Navigation';
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

/**
 * Command palette (UX-07) — a keyboard-first ⌘K / Ctrl-K overlay for fuzzy navigation + quick actions
 * (create agent, place test call, toggle theme, cycle motion). Arrow keys move the selection, Enter runs,
 * Esc closes; the input autofocuses. Animated open (framer, reduced-motion-safe). Mounted once in the
 * dashboard shell; also openable via `openCommandPalette()` (header search button).
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { animate, level, setLevel } = useMotionLevel();
  const userTheme = useUserTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = user?.memberships?.some((m) => m.role === 'SUPER_ADMIN') ?? false;
  const isReseller =
    user?.memberships?.some((m) => m.role === 'RESELLER_ADMIN' || m.role === 'SUPER_ADMIN') ??
    false;

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const commands = useMemo<Command[]>(() => {
    const actions: Command[] = [
      {
        id: 'act-new-agent',
        label: 'Create an agent',
        group: 'Actions',
        icon: <Plus size={16} />,
        keywords: 'new build voice',
        run: () => go('/dashboard/agents/new'),
      },
      {
        id: 'act-test-call',
        label: 'Place a test call',
        group: 'Actions',
        icon: <PhoneOutgoing size={16} />,
        keywords: 'dial phone outbound',
        run: () => go('/dashboard/calls'),
      },
      {
        id: 'act-theme',
        label: `Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`,
        group: 'Actions',
        icon: resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        keywords: 'dark light appearance color',
        run: () => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          close();
        },
      },
      {
        id: 'act-motion',
        label: `Motion: ${level} → ${level === 'full' ? 'reduced' : level === 'reduced' ? 'off' : 'full'}`,
        group: 'Actions',
        icon: <Gauge size={16} />,
        keywords: 'animation reduce accessibility',
        run: () => {
          setLevel(level === 'full' ? 'reduced' : level === 'reduced' ? 'off' : 'full');
          close();
        },
      },
      {
        id: 'act-theme-preset',
        label: (() => {
          const i = THEME_PRESETS.indexOf(userTheme.preset);
          const next = THEME_PRESETS[(i + 1) % THEME_PRESETS.length];
          return `Theme: ${userTheme.preset} → ${next}`;
        })(),
        group: 'Actions',
        icon: <Palette size={16} />,
        keywords: 'colour color preset nebula aurora sunset ocean grape forest mono contrast',
        run: () => {
          const i = THEME_PRESETS.indexOf(userTheme.preset);
          const next = THEME_PRESETS[(i + 1) % THEME_PRESETS.length];
          if (next) setUserTheme({ preset: next, colors: {} });
          close();
        },
      },
      {
        id: 'act-tour',
        label: 'Take the product tour',
        group: 'Actions',
        icon: <Compass size={16} />,
        keywords: 'coachmark guide walkthrough help',
        run: () => {
          close();
          startTour();
        },
      },
      {
        id: 'act-onboarding',
        label: 'Restart onboarding',
        group: 'Actions',
        icon: <ListChecks size={16} />,
        keywords: 'setup wizard getting started',
        run: () => {
          close();
          openOnboarding();
        },
      },
      {
        id: 'act-signout',
        label: 'Sign out',
        group: 'Actions',
        icon: <Sparkles size={16} />,
        keywords: 'logout leave',
        run: () => {
          close();
          signOut();
          router.push('/sign-in');
        },
      },
    ];
    const nav: Command[] = flatNavItems(isReseller, isSuperAdmin).map((item) => {
      const Icon = item.icon;
      return {
        id: `nav-${item.href}`,
        label: item.label,
        hint: 'Go to',
        group: 'Navigation',
        icon: <Icon size={16} />,
        keywords: item.href,
        run: () => go(item.href),
      };
    });
    return [...actions, ...nav];
  }, [
    go,
    close,
    router,
    signOut,
    setTheme,
    resolvedTheme,
    level,
    setLevel,
    userTheme,
    isReseller,
    isSuperAdmin,
  ]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Global ⌘K / Ctrl-K to toggle; a custom event lets the header button open it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('vq-open-command', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('vq-open-command', onOpen);
    };
  }, []);

  // Focus the input + reset selection whenever the palette opens.
  useEffect(() => {
    if (open) {
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the active row from running past the filtered list.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[active]?.run();
    }
  };

  // Scroll the active row into view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({
      block: 'nearest',
    });
  }, [active]);

  let lastGroup: string | null = null;

  return (
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]"
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close command palette"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={close}
          />
          {/* biome-ignore lint/a11y/useSemanticElements: an animated framer element can't be a native <dialog>; role="dialog" + aria-modal is the correct pattern here. */}
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative w-full max-w-xl overflow-hidden rounded-vq-card border border-vq-border bg-vq-bg-overlay shadow-elev-3"
            initial={animate ? { opacity: 0, y: -8, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={animate ? { opacity: 0, y: -8, scale: 0.98 } : { opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2 border-vq-border border-b px-3">
              <Search size={16} className="text-vq-text-lo" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Search actions and pages…"
                aria-label="Search commands"
                className="h-12 flex-1 bg-transparent text-sm text-vq-text-hi outline-none placeholder:text-vq-text-lo"
              />
              <kbd className="rounded-vq-sm border border-vq-border px-1.5 py-0.5 font-mono text-[0.65rem] text-vq-text-lo">
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-vq-text-lo">No matches.</p>
              ) : (
                results.map((c, i) => {
                  const showHeader = c.group !== lastGroup;
                  lastGroup = c.group;
                  return (
                    <div key={c.id}>
                      {showHeader && (
                        <p className="px-2.5 pt-2 pb-1 font-medium text-[0.65rem] text-vq-text-lo uppercase tracking-wide">
                          {c.group}
                        </p>
                      )}
                      <button
                        type="button"
                        data-idx={i}
                        onClick={() => c.run()}
                        onMouseMove={() => setActive(i)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-vq px-2.5 py-2 text-left text-sm',
                          i === active ? 'bg-primary-500/12 text-vq-text-hi' : 'text-vq-text-lo',
                        )}
                      >
                        <span className={cn(i === active ? 'text-primary-500' : 'text-vq-text-lo')}>
                          {c.icon}
                        </span>
                        <span className="flex-1 truncate text-vq-text-hi">{c.label}</span>
                        {c.hint && <span className="text-vq-text-lo text-xs">{c.hint}</span>}
                        {i === active && (
                          <CornerDownLeft size={13} className="text-vq-text-lo" aria-hidden />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
