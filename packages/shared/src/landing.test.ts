import { describe, expect, it } from 'vitest';
import {
  LANDING_CHANNELS,
  LANDING_DIFFERENTIATORS,
  LANDING_PRICING,
  LANDING_USE_CASES,
  formatTierPrice,
} from './landing.js';

describe('landing content (Day 95)', () => {
  it('has four use cases with unique keys + non-empty copy', () => {
    expect(LANDING_USE_CASES).toHaveLength(4);
    const keys = LANDING_USE_CASES.map((u) => u.key);
    expect(new Set(keys).size).toBe(4);
    for (const u of LANDING_USE_CASES) {
      expect(u.title.length).toBeGreaterThan(0);
      expect(u.blurb.length).toBeGreaterThan(0);
    }
  });

  it('lists the shipped channels incl. the Day-93 additions', () => {
    for (const ch of ['Phone', 'WhatsApp', 'Telegram', 'Messenger', 'Instagram', 'RCS']) {
      expect(LANDING_CHANNELS).toContain(ch);
    }
  });

  it('pricing mirrors the Free/Pro/Scale ladder, ascending, with Pro featured', () => {
    expect(LANDING_PRICING.map((t) => t.name)).toEqual(['Free', 'Pro', 'Scale']);
    const prices = LANDING_PRICING.map((t) => t.priceUsd);
    expect(prices).toEqual([...prices].sort((a, b) => a - b)); // ascending
    expect(LANDING_PRICING.find((t) => t.featured)?.name).toBe('Pro');
    for (const t of LANDING_PRICING) expect(t.highlights.length).toBeGreaterThan(0);
  });

  it('formats tier prices', () => {
    expect(formatTierPrice(LANDING_PRICING[0]!)).toBe('Free');
    expect(formatTierPrice(LANDING_PRICING[1]!)).toBe('$99/mo');
  });

  it('has differentiators with titles + blurbs', () => {
    expect(LANDING_DIFFERENTIATORS.length).toBeGreaterThanOrEqual(3);
    for (const d of LANDING_DIFFERENTIATORS) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.blurb.length).toBeGreaterThan(0);
    }
  });
});
