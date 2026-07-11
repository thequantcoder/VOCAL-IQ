'use client';

import { useSyncExternalStore } from 'react';

/**
 * First-run onboarding state (UX-14) — resumable + skippable, persisted per browser (localStorage).
 * Tracks the wizard step, the chosen use-case, and whether it's been completed or dismissed, so a new
 * user can leave (e.g. to create an agent) and resume where they left off. A tiny module store (like the
 * theme store) so the wizard + any trigger (⌘K, checklist) share one source.
 */

export type UseCase = 'sales' | 'support' | 'appointments' | 'surveys';

export interface OnboardingState {
  step: number;
  useCase: UseCase | null;
  completed: boolean;
  dismissed: boolean;
  /** Explicitly reopened (via "Restart onboarding") — shows the wizard even for existing workspaces.
   * Not persisted (session-only). */
  requested: boolean;
}

const KEY = 'vq-onboarding';
const DEFAULT: OnboardingState = {
  step: 0,
  useCase: null,
  completed: false,
  dismissed: false,
  requested: false,
};

function read(): OnboardingState {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<OnboardingState>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let current = read();
const listeners = new Set<() => void>();

function commit(next: OnboardingState) {
  current = next;
  try {
    // `requested` is session-only — don't persist it.
    const { requested: _drop, ...persisted } = current;
    localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch {
    /* storage unavailable — keep in-memory */
  }
  for (const l of listeners) l();
}

export function getOnboarding(): OnboardingState {
  return current;
}

export function setOnboarding(patch: Partial<OnboardingState>): void {
  commit({ ...current, ...patch });
}

/** Re-open the wizard from anywhere (works even for an established workspace). */
export function openOnboarding(): void {
  commit({ ...current, step: 0, dismissed: false, completed: false, requested: true });
}

export function useOnboarding(): OnboardingState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getOnboarding,
    () => DEFAULT,
  );
}
