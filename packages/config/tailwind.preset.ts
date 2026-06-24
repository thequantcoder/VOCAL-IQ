import type { Config } from 'tailwindcss';

/**
 * VocalIQ Tailwind preset — seeds the design-system tokens (DESIGN-SYSTEM.md §1–3).
 * Full token system + the Waveform motif land on Day 1; this is the Day 0 foundation
 * so apps share a single source of brand truth (dark-first, "cyan = live").
 */
const preset = {
  darkMode: 'class',
  content: [],
  theme: {
    extend: {
      colors: {
        vq: {
          'bg-base': '#0B0B12',
          'bg-elevated': '#14141F',
          'bg-overlay': '#1C1C2B',
          border: '#262635',
          violet: '#7C5CFF',
          'violet-deep': '#5B21B6',
          cyan: '#22D3EE',
          'text-hi': '#F4F4FB',
          'text-lo': '#9A9AB2',
          success: '#34D399',
          warn: '#FBBF24',
          danger: '#FB7185',
        },
      },
      borderRadius: { vq: '10px', 'vq-card': '14px' },
    },
  },
  plugins: [],
} satisfies Partial<Config>;

export default preset;
