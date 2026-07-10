'use client';

import { AnimatePresence, m } from 'framer-motion';
import { type ReactNode, useSyncExternalStore } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * Toast system (UX-03) — imperative `toast()` API + a `<Toaster>` mounted once app-wide. A tiny
 * module store (no external dep) drives an `AnimatePresence` stack; entrances honour motion level.
 * Semantic variants read the UX-02 tokens.
 */

export type ToastVariant = 'default' | 'success' | 'error' | 'warn' | 'info';

interface ToastItem {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  variant: ToastVariant;
  duration: number;
}

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const l of listeners) l();
}

function dismiss(id: string) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(title: ReactNode, variant: ToastVariant, opts?: ToastOptions) {
  const id = `toast-${++counter}`;
  const duration = opts?.duration ?? (variant === 'error' ? 6000 : 4000);
  items = [...items, { id, title, variant, description: opts?.description, duration }];
  emit();
  if (duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismiss(id), duration);
  }
  return id;
}

export interface ToastOptions {
  description?: ReactNode;
  duration?: number;
}

/** Fire a toast. `toast('Saved')` or `toast.success('Published', { description })`. */
export const toast = Object.assign(
  (title: ReactNode, opts?: ToastOptions & { variant?: ToastVariant }) =>
    push(title, opts?.variant ?? 'default', opts),
  {
    success: (title: ReactNode, opts?: ToastOptions) => push(title, 'success', opts),
    error: (title: ReactNode, opts?: ToastOptions) => push(title, 'error', opts),
    warn: (title: ReactNode, opts?: ToastOptions) => push(title, 'warn', opts),
    info: (title: ReactNode, opts?: ToastOptions) => push(title, 'info', opts),
    dismiss,
  },
);

const EMPTY: ToastItem[] = [];
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function useToasts() {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );
}

const accent: Record<ToastVariant, string> = {
  default: 'bg-neutral-400',
  success: 'bg-success',
  error: 'bg-danger',
  warn: 'bg-warn',
  info: 'bg-info',
};

/** Mount once near the app root (inside MotionProvider). Renders the toast stack. */
export function Toaster() {
  const list = useToasts();
  const { animate } = useMotionLevel();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <m.div
            key={t.id}
            layout={animate}
            initial={animate ? { opacity: 0, y: 16, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={animate ? { opacity: 0, x: 24 } : { opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto relative overflow-hidden rounded-vq-card border border-vq-border bg-vq-bg-overlay p-3 pl-4 shadow-elev-3"
            // biome-ignore lint/a11y/useSemanticElements: role="status" is the correct live-region semantics for a toast container.
            role="status"
          >
            <span className={cn('absolute inset-y-0 left-0 w-1', accent[t.variant])} aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium text-sm text-vq-text-hi">{t.title}</span>
                {t.description && <span className="text-vq-text-lo text-xs">{t.description}</span>}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="-mr-1 shrink-0 rounded-vq-sm p-0.5 text-vq-text-lo transition-colors hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring"
              >
                <svg viewBox="0 0 14 14" className="size-3.5" aria-hidden="true" fill="none">
                  <path
                    d="M2 2l10 10M12 2L2 12"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
