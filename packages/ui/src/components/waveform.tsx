import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface WaveformProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of bars to render. */
  bars?: number;
  /** Real-time/speaking state — switches to the cyan "live" gradient (DESIGN-SYSTEM §1). */
  live?: boolean;
  /** Accessible label; when omitted the waveform is treated as decorative. */
  label?: string;
}

/*
 * The signature element (DESIGN-SYSTEM §0/§5): a living waveform — sound made
 * visible — reused on the landing hero, live-call view, and loading states.
 *
 * Heights/delays are deterministic (no random in render) so SSR and client match
 * exactly — no hydration flicker. Bars breathe on an ambient loop here; the
 * amplitude-reactive version (driven by real audio) lands with the live-call view
 * (Day 14). Honours prefers-reduced-motion via ui.css.
 */
export function Waveform({ bars = 28, live = false, label, className, ...props }: WaveformProps) {
  const decorative = label === undefined;
  return (
    <div
      className={cn('vq-waveform', live && 'vq-waveform--live', className)}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={label}
      {...props}
    >
      {Array.from({ length: bars }, (_, i) => {
        // Two overlaid sine envelopes give an organic, non-uniform silhouette.
        const envelope = 0.5 + 0.5 * Math.sin((i / bars) * Math.PI * 2);
        const detail = 0.25 * Math.sin(i * 1.7);
        const heightPct = Math.round(Math.min(1, Math.max(0.18, envelope + detail)) * 100);
        const style: CSSProperties = {
          height: `${heightPct}%`,
          animationDelay: `${(i % 7) * 90}ms`,
        };
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional and never reordered.
          <span key={i} className="vq-waveform__bar" style={style} />
        );
      })}
    </div>
  );
}
