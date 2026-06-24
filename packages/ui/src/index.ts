import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * @vocaliq/ui — shared component library (DESIGN-SYSTEM.md).
 * Day 1 adds the token system + base components (incl. the signature Waveform).
 * Day 0 ships the `cn` className helper + brand tokens so apps share one source.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Brand tokens mirror DESIGN-SYSTEM.md §1; "cyan = live" is reserved for real-time. */
export const tokens = {
  color: {
    bgBase: '#0B0B12',
    bgElevated: '#14141F',
    border: '#262635',
    violet: '#7C5CFF',
    cyan: '#22D3EE',
    textHi: '#F4F4FB',
    textLo: '#9A9AB2',
  },
} as const;
