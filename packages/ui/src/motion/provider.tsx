'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Motion engine (UX-01). One provider mounts `LazyMotion` (feature-split → tiny bundle) + a motion-
 * level context, so every animated primitive in the app runs through a single, reduced-motion-aware,
 * user-controllable seam. Levels: `full` (everything) · `reduced` (fade only, no movement/scale) ·
 * `off` (instant). Seeded from `prefers-reduced-motion`, persisted per browser, and mirrored onto
 * `<html data-motion="…">` so CSS keyframes (the waveform) react too. The value later merges into the
 * theme engine (UX-12).
 */

export type MotionLevel = 'full' | 'reduced' | 'off';

const STORAGE_KEY = 'vq-motion';

interface MotionContextValue {
  level: MotionLevel;
  setLevel: (level: MotionLevel) => void;
}

const MotionContext = createContext<MotionContextValue>({ level: 'full', setLevel: () => {} });

function isLevel(v: unknown): v is MotionLevel {
  return v === 'full' || v === 'reduced' || v === 'off';
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [level, setLevelState] = useState<MotionLevel>('full');

  // Hydrate: stored override → else OS preference → full.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (isLevel(stored)) {
      setLevelState(stored);
      return;
    }
    const osReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setLevelState(osReduced ? 'reduced' : 'full');
  }, []);

  // Mirror onto the document root so CSS ([data-motion="off"]/"reduced") can react.
  useEffect(() => {
    document.documentElement.dataset.motion = level;
  }, [level]);

  const setLevel = useCallback((next: MotionLevel) => {
    setLevelState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  return (
    <MotionContext.Provider value={{ level, setLevel }}>
      {/* We control reduced/off in the primitives; keep framer's own auto-reduce off (`never`) so
          behaviour is deterministic across the level switch. */}
      <MotionConfig reducedMotion="never">
        <LazyMotion features={domAnimation} strict>
          {children}
        </LazyMotion>
      </MotionConfig>
    </MotionContext.Provider>
  );
}

/**
 * Read + set the motion level. `animate` = should we animate at all (level ≠ off); `subtle` = fade-only
 * (level = reduced) — primitives drop movement/scale when subtle and render plain when `!animate`.
 */
export function useMotionLevel() {
  const { level, setLevel } = useContext(MotionContext);
  return { level, setLevel, animate: level !== 'off', subtle: level === 'reduced' };
}
