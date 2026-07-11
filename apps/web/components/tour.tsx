'use client';

import { Button } from '@vocaliq/ui';
import { m } from '@vocaliq/ui/motion';
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { track } from '../lib/analytics';

/**
 * Product tour / coachmarks (UX-14b) — a spotlight system that highlights any element tagged with
 * `data-tour="<id>"`, shows a positioned tooltip with progress ("2 of 4") + Back/Next/Done, is
 * dismissible + resumable (the last step persists per browser), and marks itself done so it never nags.
 * Start it from anywhere via `startTour()` (⌘K, a "Take a tour" link). Reduced-motion-safe.
 */

interface TourStep {
  target: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    target: 'sidebar',
    title: 'Everything, grouped',
    body: 'Your ~50 tools live here in scannable sections — Build, Run, Analyze, Grow, and more.',
  },
  {
    target: 'search',
    title: 'Search + quick actions',
    body: 'Press ⌘K anywhere to jump to a page or run an action — create an agent, place a call, switch theme.',
  },
  {
    target: 'account',
    title: 'Make it yours',
    body: 'Open your account menu for Appearance — pick a theme or craft your own colours, live.',
  },
];

const DONE_KEY = 'vq-tour-done';
const IDX_KEY = 'vq-tour-idx';

let state = { open: false, index: 0 };
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export function tourDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Open the tour, resuming at the last-viewed step. */
export function startTour(): void {
  let idx = 0;
  try {
    idx = Math.min(STEPS.length - 1, Math.max(0, Number(localStorage.getItem(IDX_KEY) ?? 0)));
  } catch {
    /* ignore */
  }
  state = { open: true, index: idx };
  track('tour_started', { step: idx });
  emit();
}

function move(index: number) {
  state = { ...state, index };
  try {
    localStorage.setItem(IDX_KEY, String(index));
  } catch {
    /* ignore */
  }
  emit();
}

function close(done: boolean) {
  state = { open: false, index: state.index };
  try {
    if (done) {
      localStorage.setItem(DONE_KEY, '1');
      localStorage.removeItem(IDX_KEY);
    }
  } catch {
    /* ignore */
  }
  track(done ? 'tour_completed' : 'tour_dismissed', { step: state.index });
  emit();
}

function useTour() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Mount once in the shell. Renders the spotlight + tooltip when the tour is open. */
export function TourOverlay() {
  const { open, index } = useTour();
  const [rect, setRect] = useState<Rect | null>(null);
  const step = STEPS[index];

  // Measure the target + keep it in sync with layout/scroll/resize.
  useLayoutEffect(() => {
    if (!open || !step) return;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !step) return null;

  const pad = 8;
  const spot = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Tooltip: below the target if there's room, else above; clamped horizontally.
  const tipWidth = 300;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const below = spot ? spot.top + spot.height + 12 : vh / 2;
  const above = spot ? spot.top - 12 : vh / 2;
  const placeBelow = !spot || below + 160 < vh;
  const tipTop = spot ? (placeBelow ? below : above) : vh / 2;
  const tipLeft = spot
    ? Math.max(12, Math.min(vw - tipWidth - 12, spot.left))
    : Math.max(12, (vw - tipWidth) / 2);

  const isLast = index === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[140]">
      {/* Spotlight — a hole in a dimmed backdrop (big box-shadow); click the dim to skip. */}
      {spot ? (
        <button
          type="button"
          aria-label="Skip tour"
          onClick={() => close(false)}
          className="absolute rounded-vq-card"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      ) : (
        <button
          type="button"
          aria-label="Skip tour"
          onClick={() => close(false)}
          className="absolute inset-0 bg-black/60"
        />
      )}

      {/* Tooltip */}
      {/* biome-ignore lint/a11y/useSemanticElements: an animated framer element can't be a native <dialog>; role="dialog" is the correct coachmark pattern. */}
      <m.div
        role="dialog"
        aria-label={`Tour step ${index + 1} of ${STEPS.length}`}
        initial={{ opacity: 0, y: placeBelow ? -6 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute w-[300px] rounded-vq-card border border-vq-border bg-vq-bg-overlay p-4 shadow-elev-3"
        style={{ top: tipTop, left: tipLeft, transform: placeBelow ? 'none' : 'translateY(-100%)' }}
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-vq-text-lo text-xs">
            {index + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => close(false)}
            className="text-vq-text-lo text-xs hover:text-vq-text-hi"
          >
            Skip
          </button>
        </div>
        <h3 className="mt-1 font-display font-semibold text-vq-text-hi">{step.title}</h3>
        <p className="mt-1 text-sm text-vq-text-lo">{step.body}</p>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <span
                key={s.target}
                className={`size-1.5 rounded-full ${i === index ? 'bg-vq-violet' : 'bg-vq-border'}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <Button size="sm" variant="secondary" onClick={() => move(index - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={() => (isLast ? close(true) : move(index + 1))}>
              {isLast ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </m.div>
    </div>
  );
}
