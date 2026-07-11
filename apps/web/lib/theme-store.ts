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

function emit() {
  for (const l of listeners) l();
}

/** The current user theme (validated). */
export function getUserTheme(): ThemeConfig {
  return current;
}

/** Merge a patch into the user theme, persist it, and notify subscribers. */
export function setUserTheme(patch: Partial<ThemeConfig>): void {
  current = parseThemeConfig({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable — keep the in-memory value */
  }
  emit();
}

/** Reset to the platform default theme. */
export function resetUserTheme(): void {
  current = parseThemeConfig({});
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React hook — the current user theme, re-rendering on change. */
export function useUserTheme(): ThemeConfig {
  return useSyncExternalStore(subscribe, getUserTheme, getUserTheme);
}
