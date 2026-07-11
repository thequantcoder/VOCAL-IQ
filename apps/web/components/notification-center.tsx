'use client';

import { Illustration, Popover, PopoverContent, PopoverTrigger, cn } from '@vocaliq/ui';
import { AnimatePresence, m, useMotionLevel } from '@vocaliq/ui/motion';
import { Bell, X } from 'lucide-react';
import Link from 'next/link';
import {
  type AppNotification,
  type NotificationKind,
  clearNotifications,
  dismissNotification,
  markAllRead,
  useNotifications,
} from '../lib/notifications';

const DOT: Record<NotificationKind, string> = {
  success: 'bg-success',
  info: 'bg-info',
  warn: 'bg-warn',
  milestone: 'bg-primary-500',
};

/** Relative time, coarse (m/h/d) — good enough for a feed, no dep. */
function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

/**
 * Notification center (UX-15) — a header bell with an unread badge that opens an animated panel of the
 * in-app feed (milestones, call finished, low balance, …). Group actions: mark-all-read + clear;
 * per-item dismiss. Reads the `notifications` store (which any real-time source can feed via `notify()`).
 */
export function NotificationCenter() {
  const items = useNotifications();
  const { animate } = useMotionLevel();
  const unread = items.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
          className="relative grid size-9 place-items-center rounded-vq text-vq-text-lo transition-colors hover:bg-vq-bg-elevated hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring"
        >
          <Bell size={17} aria-hidden />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 font-medium text-[0.6rem] text-danger-fg">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-vq-border border-b px-3 py-2">
          <span className="font-medium text-sm text-vq-text-hi">Notifications</span>
          {items.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={markAllRead}
                className="text-vq-text-lo hover:text-vq-text-hi"
              >
                Mark all read
              </button>
              <span className="text-vq-border">·</span>
              <button
                type="button"
                onClick={clearNotifications}
                className="text-vq-text-lo hover:text-vq-text-hi"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Illustration name="all-done" size={84} />
              <span className="text-sm text-vq-text-lo">You're all caught up.</span>
            </div>
          ) : (
            <ul className="flex flex-col">
              <AnimatePresence initial={false}>
                {items.map((n) => (
                  <m.li
                    key={n.id}
                    layout={animate}
                    initial={animate ? { opacity: 0, height: 0 } : false}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={animate ? { opacity: 0, height: 0 } : { opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <NotificationRow n={n} />
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({ n }: { n: AppNotification }) {
  const body = (
    <div className={cn('flex items-start gap-2.5 px-3 py-2.5', !n.read && 'bg-primary-500/[0.04]')}>
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[n.kind])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-sm text-vq-text-hi">{n.title}</span>
        {n.description && <span className="text-vq-text-lo text-xs">{n.description}</span>}
        <span className="mt-0.5 text-[0.7rem] text-vq-text-lo">{ago(n.ts)}</span>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dismissNotification(n.id);
        }}
        className="shrink-0 rounded-vq-sm p-1 text-vq-text-lo opacity-0 transition-opacity hover:text-vq-text-hi focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X size={13} />
      </button>
    </div>
  );

  return (
    <div className="group border-vq-border border-b last:border-b-0">
      {n.href ? (
        <Link href={n.href} className="block hover:bg-vq-bg-base">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}
