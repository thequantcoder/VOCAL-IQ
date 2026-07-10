'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { useMotionLevel } from '../motion/provider';

/**
 * TranscriptStream (UX-04) — a live call transcript that reveals the in-flight turn word-by-word with a
 * blinking caret and speaker colour-coding (agent = violet, caller = cyan). Finalised turns render whole;
 * the last turn marked `live` streams in. Under reduced-motion the live turn appears complete (no stagger,
 * static caret). Auto-scrolls to the newest line.
 */
export interface TranscriptTurn {
  speaker: 'agent' | 'caller';
  text: string;
  /** The still-arriving turn — its words reveal progressively. */
  live?: boolean;
}

export function TranscriptStream({
  turns,
  className,
  wordMs = 90,
}: {
  turns: TranscriptTurn[];
  className?: string;
  wordMs?: number;
}) {
  const { animate } = useMotionLevel();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const liveIndex = turns.findIndex((t) => t.live);
  const liveTurn = liveIndex >= 0 ? turns[liveIndex] : undefined;
  const liveWords = liveTurn ? liveTurn.text.trim().split(/\s+/).filter(Boolean) : [];

  const [shown, setShown] = useState(liveWords.length);

  // Reveal the live turn's words on a timer; jump to full under reduced-motion.
  useEffect(() => {
    if (!liveTurn) return;
    if (!animate) {
      setShown(liveWords.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= liveWords.length) clearInterval(id);
    }, wordMs);
    return () => clearInterval(id);
    // Re-run when the live turn's text changes.
  }, [liveTurn?.text, animate, wordMs, liveWords.length, liveTurn]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every reveal/turn change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, turns.length]);

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex max-h-60 flex-col gap-2 overflow-y-auto rounded-vq-card border border-vq-border bg-vq-bg-base p-3 text-sm',
        className,
      )}
      aria-live="polite"
    >
      {turns.map((turn, i) => {
        const isLive = i === liveIndex;
        const words = turn.text.trim().split(/\s+/).filter(Boolean);
        const visible = isLive ? words.slice(0, shown) : words;
        return (
          <div key={`${turn.speaker}-${i}`} className="flex flex-col gap-0.5">
            <span
              className={cn(
                'font-medium text-[0.7rem] uppercase tracking-wide',
                turn.speaker === 'agent'
                  ? 'text-primary-500'
                  : 'text-accent-600 dark:text-accent-300',
              )}
            >
              {turn.speaker}
            </span>
            <p className="text-vq-text-hi leading-relaxed">
              {visible.join(' ')}
              {isLive && (
                <span
                  className={cn(
                    'ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-accent-500 align-middle',
                    animate && 'motion-safe:animate-[vq-caret-blink_1s_step-end_infinite]',
                  )}
                  aria-hidden="true"
                />
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
