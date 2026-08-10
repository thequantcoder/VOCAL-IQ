'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useMotionLevel } from '../motion/provider';

/**
 * Confetti celebration (UX-08) — a lazy, tasteful particle burst for TRUE milestones (first agent
 * published, first call, wallet top-up, plan upgrade). Fire imperatively via `fireConfetti()`; a single
 * `<ConfettiHost>` (mounted once, like the Toaster) renders the burst on a full-screen canvas and cleans
 * it up. Under reduced/off motion the host ignores bursts (no-op) — callers pair it with a success toast,
 * so the celebration still lands without motion.
 */

interface Burst {
  id: number;
  x: number; // 0..1 viewport-relative origin
  y: number;
}

let bursts: Burst[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const l of listeners) l();
}

/** Fire a confetti burst from a point (defaults to a little above centre). */
export function fireConfetti(origin?: { x: number; y: number }) {
  const id = ++counter;
  bursts = [...bursts, { id, x: origin?.x ?? 0.5, y: origin?.y ?? 0.38 }];
  emit();
  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      bursts = bursts.filter((b) => b.id !== id);
      emit();
    }, 1400);
  }
}

const EMPTY: Burst[] = [];
function useBursts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => bursts,
    () => EMPTY,
  );
}

const COLORS = ['#7c5cff', '#22d3ee', '#a78bfa', '#34d399', '#f59e0b', '#f43f5e'];

function BurstCanvas({ x, y }: { x: number; y: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const ox = x * w;
    const oy = y * h;
    // Deterministic-ish spread (no Math.random dependency on a single call is fine here).
    const parts = Array.from({ length: 90 }, (_, i) => {
      const angle = (i / 90) * Math.PI * 2 + (i % 5) * 0.3;
      const speed = 4 + (i % 7);
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed * (0.6 + (i % 3) * 0.25),
        vy: Math.sin(angle) * speed - 3,
        rot: i,
        vr: (i % 5) - 2,
        color: COLORS[i % COLORS.length] as string,
        size: 5 + (i % 4),
        life: 1,
      };
    });

    let raf = 0;
    let frame = 0;
    const tick = () => {
      frame += 1;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.22; // gravity
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - frame / 80);
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        ctx.restore();
      }
      if (frame < 84) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [x, y]);

  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: a decorative, pointer-events-none confetti canvas is not a focus target.
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[130] size-full"
      aria-hidden="true"
    />
  );
}

/** Mount once near the app root (inside MotionProvider). Renders active confetti bursts. */
export function ConfettiHost() {
  const list = useBursts();
  const { animate } = useMotionLevel();
  // Respect reduced/off motion — the caller's success toast carries the celebration instead.
  if (!animate) return null;
  return (
    <>
      {list.map((b) => (
        <BurstCanvas key={b.id} x={b.x} y={b.y} />
      ))}
    </>
  );
}
