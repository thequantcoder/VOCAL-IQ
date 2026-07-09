'use client';

import { Button } from '@vocaliq/ui';
import { Pause, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '../lib/analytics';

/**
 * The signature hero (DESIGN-SYSTEM §0/§5a): a living violet→cyan waveform that TALKS. "Hear it talk"
 * plays a short voice signature (synthesised via the Web Audio API — a real voice clip drops in by
 * swapping the source) and the bars react to the live amplitude. Idle: an ambient breathing loop.
 * Honours prefers-reduced-motion (no pulsing) + degrades cleanly with no Web Audio. Bars are mutated
 * by ref in the animation loop (no per-frame React re-render) so it stays smooth.
 */

const BARS = 52;
// A short, resolving motif (G4 C5 E5 D5 G5) — pleasant + brand-neutral until a real clip is set.
const MOTIF = [392, 523.25, 659.25, 587.33, 783.99];
const NOTE_DUR = 0.32;

export function AudioHero() {
  const [playing, setPlaying] = useState(false);
  const reducedRef = useRef(false);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const raf = useRef<number | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = mq.matches;
    const on = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const stop = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    setPlaying(false);
  }, []);

  // Ambient breathing loop while idle (skipped under reduced-motion).
  useEffect(() => {
    if (playing || reducedRef.current) return;
    let t = 0;
    let id = 0;
    const loop = () => {
      t += 0.045;
      for (let i = 0; i < bars.current.length; i++) {
        const el = bars.current[i];
        if (!el) continue;
        const env = 0.5 + 0.5 * Math.sin((i / BARS) * Math.PI * 2 + t);
        const detail = 0.22 * Math.sin(i * 1.7 + t);
        const h = 16 + Math.round(Math.min(1, Math.max(0.14, env + detail)) * 70);
        el.style.height = `${h}%`;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const play = useCallback(() => {
    if (playing) {
      stop();
      return;
    }
    track('landing_hear_it_talk');
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return; // no Web Audio → the button simply no-ops (graceful)

    const audio = new AC();
    ctx.current = audio;
    const master = audio.createGain();
    master.gain.value = 0.9;
    const analyser = audio.createAnalyser();
    analyser.fftSize = 128;
    master.connect(analyser);
    analyser.connect(audio.destination);

    const now = audio.currentTime;
    MOTIF.forEach((freq, i) => {
      const osc = audio.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = audio.createGain();
      const t0 = now + i * NOTE_DUR;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + NOTE_DUR * 0.95);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + NOTE_DUR);
    });

    setPlaying(true);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const render = () => {
      analyser.getByteFrequencyData(data);
      for (let i = 0; i < bars.current.length; i++) {
        const el = bars.current[i];
        if (!el) continue;
        const v = data[Math.floor((i / BARS) * data.length)] ?? 0;
        el.style.height = `${12 + Math.round((v / 255) * 88)}%`;
      }
      raf.current = requestAnimationFrame(render);
    };
    if (!reducedRef.current) raf.current = requestAnimationFrame(render);
    timer.current = setTimeout(stop, MOTIF.length * NOTE_DUR * 1000 + 250);
  }, [playing, stop]);

  // Cleanup on unmount.
  useEffect(() => stop, [stop]);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div
        className="flex h-40 w-full max-w-2xl items-center justify-center gap-[3px] sm:h-48"
        role="img"
        aria-label="VocalIQ living waveform"
      >
        {Array.from({ length: BARS }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: positional bars, never reordered.
            key={i}
            ref={(el) => {
              bars.current[i] = el;
            }}
            className="w-full max-w-[7px] rounded-vq-pill transition-[height] duration-75 ease-out"
            style={{
              height: '28%',
              background: `linear-gradient(to top, var(--vq-violet), ${
                playing ? 'var(--vq-cyan)' : 'var(--vq-violet)'
              })`,
              opacity: playing ? 1 : 0.85,
            }}
          />
        ))}
      </div>
      <Button size="lg" variant="secondary" onClick={play} aria-pressed={playing}>
        {playing ? <Pause size={18} /> : <Volume2 size={18} />}
        {playing ? 'Playing…' : 'Hear it talk'}
      </Button>
    </div>
  );
}
