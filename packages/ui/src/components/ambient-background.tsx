'use client';

import { useEffect, useRef } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * AmbientBackground (UX-05) — a GPU-cheap atmosphere layer for hero/section headers, auth pages, and
 * empty states: a few large violet/cyan/indigo gradient blobs drifting on lissajous paths (rendered at
 * quarter-res + scaled up for a free blur) with an optional drifting waveform-particle layer.
 *
 * Performance guards: renders only while on-screen (IntersectionObserver), throttled rAF, quarter-res
 * canvas, and — critically — under reduced-motion it paints ONE static frame and runs no loop. Absolutely
 * positioned + `aria-hidden`; place inside a `relative` container behind content.
 */
export interface AmbientBackgroundProps {
  /** 0..1 opacity of the whole layer. */
  intensity?: number;
  /** Add the drifting waveform-particle layer. */
  particles?: boolean;
  className?: string;
}

const BLOBS = [
  {
    hue: 258,
    sat: 90,
    light: 62,
    rx: 0.55,
    ry: 0.5,
    ax: 0.18,
    ay: 0.14,
    sx: 0.11,
    sy: 0.17,
    ph: 0,
  },
  { hue: 190, sat: 90, light: 58, rx: 0.6, ry: 0.55, ax: 0.2, ay: 0.16, sx: 0.13, sy: 0.09, ph: 2 },
  { hue: 224, sat: 85, light: 60, rx: 0.5, ry: 0.48, ax: 0.16, ay: 0.2, sx: 0.08, sy: 0.14, ph: 4 },
];

export function AmbientBackground({
  intensity = 0.5,
  particles = false,
  className,
}: AmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { animate } = useMotionLevel();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Quarter-res render surface (scaled up by CSS → free blur).
    const SCALE = 0.25;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = Math.max(1, Math.floor(canvas.clientWidth * SCALE));
      h = Math.max(1, Math.floor(canvas.clientHeight * SCALE));
      canvas.width = w;
      canvas.height = h;
    };
    resize();

    const dots = particles
      ? Array.from({ length: 26 }, (_, i) => ({
          x: (i * 97) % 100,
          y: (i * 53) % 100,
          r: 0.6 + ((i * 7) % 5) * 0.3,
          spd: 0.15 + ((i * 3) % 5) * 0.06,
          ph: (i % 7) * 0.9,
        }))
      : [];

    const paint = (time: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of BLOBS) {
        const cx = w * (0.5 + b.ax * Math.sin(time * b.sx + b.ph));
        const cy = h * (0.5 + b.ay * Math.cos(time * b.sy + b.ph));
        const rad = Math.max(w, h) * b.rx;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `hsla(${b.hue} ${b.sat}% ${b.light}% / 0.55)`);
        g.addColorStop(1, `hsla(${b.hue} ${b.sat}% ${b.light}% / 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      if (dots.length) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (const d of dots) {
          const y = (d.y + time * d.spd * 12) % 100;
          ctx.beginPath();
          ctx.arc((d.x / 100) * w, (y / 100) * h, d.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    if (!animate) {
      paint(6); // one static frame
      return;
    }

    let raf = 0;
    let running = false;
    let t = 0;
    const loop = () => {
      t += 0.016;
      paint(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // Only animate while on-screen.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(canvas);
    window.addEventListener('resize', resize);
    return () => {
      stop();
      io.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [animate, particles]);

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a decorative, pointer-events-none background canvas is not a focus target.
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
      style={{ opacity: intensity, filter: 'blur(24px)' }}
    />
  );
}
