'use client';

import { type ThemeConfig, parseThemeConfig } from '@vocaliq/shared';
import { useSyncExternalStore } from 'react';

/**
 * Per-user theme store (UX-12) — the user's `ThemeConfig`, persisted to `localStorage` for instant
 * apply, exposed through a tiny module store (like the toast store) so the applier + any settings UI
 * (UX-13) share one source. DB persistence + the resolution hierarchy land in UX-12b; here the store is
 * the local, immediate layer.
 */

const KEY = 'vq-theme';

function read(): ThemeConfig {
  if (typeof window === 'undefined') return parseThemeConfig({});
  try {
    const raw = localStorage.getItem(KEY);
    return parseThemeConfig(raw ? JSON.parse(raw) : {});
  } catch {
    return parseThemeConfig({});
  }
}

let current: ThemeConfig = read();
const listeners = new Set<() => void>();

/** Server persister (registered by <ThemeSync> once auth + token are available). */
let persister: ((theme: ThemeConfig) => void) | null = null;

function emit() {
  for (const l of listeners) l();
}

function persistLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
}

/** The current user theme (validated). */
export function getUserTheme(): ThemeConfig {
  return current;
}

/** Register the server-persist function (user-initiated changes POST to the API). */
export function registerThemePersister(fn: ((theme: ThemeConfig) => void) | null): void {
  persister = fn;
}

/** User-initiated change: merge, persist locally + to the server, and notify. */
export function setUserTheme(patch: Partial<ThemeConfig>): void {
  current = parseThemeConfig({ ...current, ...patch });
  persistLocal();
  persister?.(current);
  emit();
}

/** Server → local hydration (on login): set + persist locally WITHOUT re-POSTing to the server. */
export function hydrateUserTheme(raw: unknown): void {
  current = parseThemeConfig(raw);
  persistLocal();
  emit();
}

/** Reset to the platform default theme (persists the reset to the server too). */
export function resetUserTheme(): void {
  current = parseThemeConfig({});
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  persister?.(current);
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Cross-tab sync (UX-13): when another tab writes the theme, adopt it here (no re-persist to server).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    const next = parseThemeConfig(e.newValue ? JSON.parse(e.newValue) : {});
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      current = next;
      emit();
    }
  });
}

/** React hook — the current user theme, re-rendering on change. */
export function useUserTheme(): ThemeConfig {
  return useSyncExternalStore(subscribe, getUserTheme, getUserTheme);
}
