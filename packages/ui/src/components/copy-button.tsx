'use client';

import { useState } from 'react';
import { cn } from '../lib/cn';

/**
 * CopyButton (UX-08) — copy-to-clipboard with a tick micro-interaction: the copy glyph swaps to a
 * drawing checkmark for ~1.6s, and the label announces "Copied" to AT. Optional inline label. Falls
 * back silently if the clipboard API is unavailable.
 */
export function CopyButton({
  value,
  label = 'Copy',
  showLabel = false,
  className,
}: {
  value: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-vq-sm px-1.5 py-1 text-sm text-vq-text-lo transition-colors',
        'hover:text-vq-text-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vq-ring',
        copied && 'text-success',
        className,
      )}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-6.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="[stroke-dasharray:18] [stroke-dashoffset:18] motion-safe:animate-[vq-check-draw_240ms_var(--ease-out-soft)_forwards] motion-reduce:[stroke-dashoffset:0]"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden="true">
          <rect
            x="5.5"
            y="5.5"
            width="8"
            height="8"
            rx="1.6"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
      {showLabel && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}
