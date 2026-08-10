'use client';

import { useEffect, useRef } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';
import type { AgentState } from './use-agent-state';

/**
 * LiveWaveform (UX-04) — the signature "sound made visible" element, now amplitude-reactive. Drives a
 * canvas of mirrored bars from one of three sources (in priority order):
 *   1. `analyser` — a Web Audio `AnalyserNode` (real mic/agent audio),
 *   2. `amplitude` — a controlled 0..1 level,
 *   3. `state` — a synthetic envelope per agent state (idle breathing / listening / thinking / speaking).
 * Violet→cyan gradient (cyan = "live"). Under reduced-motion it paints a single static silhouette and
 * runs no rAF loop. The loop is throttled to the display refresh and fully cleaned up on unmount.
 */
export interface LiveWaveformProps {
  state?: AgentState;
  amplitude?: number;
  analyser?: AnalyserNode;
  bars?: number;
  className?: string;
  label?: string;
}

export function LiveWaveform({
  state = 'idle',
  amplitude,
  analyser,
  bars = 48,
  className,
  label,
}: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { animate } = useMotionLevel();
  // Keep the latest inputs in refs so the rAF loop never restarts on prop change.
  const stateRef = useRef(state);
  const ampRef = useRef(amplitude);
  const analyserRef = useRef(analyser);
  stateRef.current = state;
  ampRef.current = amplitude;
  analyserRef.current = analyser;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    // Smoothed per-bar heights for a fluid (non-jittery) motion.
    const heights = new Float32Array(bars).fill(0.15);
    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Synthetic per-state amplitude when no real audio is supplied.
    const synthLevel = (s: AgentState, i: number, time: number): number => {
      const center = 1 - Math.abs(i / (bars - 1) - 0.5) * 2; // 0 at edges → 1 centre
      switch (s) {
        case 'listening': {
          const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i * 0.35);
          return 0.18 + 0.5 * pulse * (0.5 + 0.5 * center);
        }
        case 'thinking': {
          const shimmer = 0.5 + 0.5 * Math.sin(time * 6 - i * 0.6);
          return 0.14 + 0.16 * shimmer;
        }
        case 'speaking': {
          const a = Math.sin(time * 7 + i * 0.5);
          const b = Math.sin(time * 11 - i * 0.3);
          return 0.2 + 0.7 * Math.abs(a * 0.6 + b * 0.4) * (0.45 + 0.55 * center);
        }
        default: {
          // idle — a slow shared breath
          return 0.14 + 0.06 * (0.5 + 0.5 * Math.sin(time * 1.4 + i * 0.2));
        }
      }
    };

    const paint = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgb(124, 92, 255)'); // primary / violet
      grad.addColorStop(1, 'rgb(34, 211, 238)'); // accent / cyan
      ctx.fillStyle = grad;

      const gap = 2;
      const barW = Math.max(1.5, w / bars - gap);
      const mid = h / 2;

      for (let i = 0; i < bars; i++) {
        let target: number;
        const an = analyserRef.current;
        if (an && freq) {
          an.getByteFrequencyData(freq);
          const idx = Math.floor((i / bars) * freq.length);
          target = (freq[idx] ?? 0) / 255;
        } else if (typeof ampRef.current === 'number') {
          const center = 1 - Math.abs(i / (bars - 1) - 0.5) * 2;
          target = 0.12 + ampRef.current * (0.4 + 0.6 * center);
        } else {
          target = synthLevel(stateRef.current, i, t);
        }
        // Ease toward the target for smoothness.
        const prev = heights[i] ?? 0.15;
        const eased = prev + (target - prev) * 0.35;
        heights[i] = eased;

        const barH = Math.max(barW, eased * h * 0.92);
        const x = i * (barW + gap);
        const r = barW / 2;
        // Rounded mirrored bar.
        ctx.beginPath();
        const top = mid - barH / 2;
        ctx.roundRect(x, top, barW, barH, r);
        ctx.fill();
      }
    };

    if (!animate) {
      // Static silhouette (reduced-motion / off): paint once with a mid envelope.
      for (let i = 0; i < bars; i++) {
        heights[i] = synthLevel('idle', i, 0.6);
      }
      paint();
      return;
    }

    const loop = () => {
      t += 0.016;
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [animate, bars, analyser]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('h-16 w-full', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
