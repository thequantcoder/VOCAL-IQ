'use client';

import { useSyncExternalStore } from 'react';

/**
 * Notification center store (UX-15) — an in-app feed of noteworthy events (milestones, call finished,
 * low balance, agent published). A tiny module store (like the toast store) so anything can `notify()`
 * and the bell + panel render it. Persisted per browser so unread state survives a reload; capped so it
 * never grows unbounded. Real-time sources (Socket.IO) can call `notify()` as their sink later.
 */

export type NotificationKind = 'success' | 'info' | 'warn' | 'milestone';

export interface AppNotification {
  id: string;
  title: string;
  description?: string;
  kind: NotificationKind;
  href?: string;
  ts: number;
  read: boolean;
}

const KEY = 'vq-notifications';
const MAX = 40;

function load(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch {
    return [];
  }
}

let items: AppNotification[] = load();
const listeners = new Set<() => void>();
let counter = 0;

function commit(next: AppNotification[]) {
  items = next.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable — keep in-memory */
  }
  for (const l of listeners) l();
}

/** Push a notification to the top of the feed. `ts` is passed in (stores can't call Date.now freely). */
export function notify(n: {
  title: string;
  description?: string;
  kind?: NotificationKind;
  href?: string;
}): void {
  const ts = typeof performance !== 'undefined' ? Date.now() : 0;
  const entry: AppNotification = {
    id: `n-${++counter}-${ts}`,
    title: n.title,
    kind: n.kind ?? 'info',
    ts,
    read: false,
    ...(n.description ? { description: n.description } : {}),
    ...(n.href ? { href: n.href } : {}),
  };
  commit([entry, ...items]);
}

export function markAllRead(): void {
  commit(items.map((n) => ({ ...n, read: true })));
}

export function dismissNotification(id: string): void {
  commit(items.filter((n) => n.id !== id));
}

export function clearNotifications(): void {
  commit([]);
}

const EMPTY: AppNotification[] = [];
export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => EMPTY,
  );
}
