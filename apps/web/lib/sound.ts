'use client';

import { useSyncExternalStore } from 'react';

/**
 * Optional UI sound (UX-15b) — subtle, on-brand Web-Audio cues (no audio files) for notification /
 * success / error. **Off by default**, user-toggleable, persisted per browser. Synthesises short sine
 * blips so there's nothing to download and it respects the mute preference. Fully no-ops when disabled
 * or when Web Audio is unavailable.
 */

const KEY = 'vq-sound';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = read();
const listeners = new Set<() => void>();

export function getSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
  if (on) playCue('success'); // a tiny confirmation the first time it's turned on
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSoundEnabled,
    () => false,
  );
}

type Cue = 'notify' | 'success' | 'error';
const CUES: Record<Cue, number[]> = {
  notify: [660],
  success: [523.25, 783.99], // C5 → G5
  error: [349.23, 261.63], // F4 → C4
};

let ctx: AudioContext | null = null;
function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Play a short cue if sound is enabled + supported. Safe to call from anywhere. */
export function playCue(kind: Cue): void {
  if (!enabled) return;
  const ac = audioContext();
  if (!ac) return;
  const notes = CUES[kind];
  notes.forEach((freq, i) => {
    const t = ac.currentTime + i * 0.09;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  });
}
