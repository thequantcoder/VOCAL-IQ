/**
 * Marketing landing-page content (Day 95) — the structured, typed positioning data rendered by the
 * public site. Kept here (not as loose JSX) so it's a single source of truth, testable, and aligned
 * with the real product: the pricing tiers mirror the seeded Free/Pro/Scale plans (Day 15/94) and the
 * channel list mirrors the shipped surfaces (Days 44/93). Prose lives with the data; the page just
 * lays it out per DESIGN-SYSTEM §5a/§9.
 */

export interface UseCase {
  key: string;
  title: string;
  blurb: string;
}

/** The four headline use cases (DESIGN-SYSTEM §9 — specific, benefit-first, no hype). */
export const LANDING_USE_CASES: UseCase[] = [
  {
    key: 'sales',
    title: 'Sales that never sleeps',
    blurb: 'Qualify, pitch, and book — inbound and outbound, in any language, at 3am.',
  },
  {
    key: 'support',
    title: 'Support without the wait',
    blurb: 'Answer on the first ring, resolve the routine, and hand off with full context.',
  },
  {
    key: 'appointments',
    title: 'Appointments on autopilot',
    blurb: 'Book, confirm, and reschedule straight into the calendar — no tag, no tab.',
  },
  {
    key: 'surveys',
    title: 'Surveys people finish',
    blurb: 'Conversational research that listens, adapts, and captures the why.',
  },
];

export interface Differentiator {
  title: string;
  blurb: string;
}

/** The moat — why VocalIQ, not a template (DESIGN-SYSTEM §0 thesis). */
export const LANDING_DIFFERENTIATORS: Differentiator[] = [
  {
    title: 'Every surface, one agent',
    blurb: 'Phone, web, SIP, and the messaging apps your customers already use — one runtime.',
  },
  {
    title: 'Truly white-label',
    blurb: 'Resell it as your own: custom domains, theming, wallets, and markup — end to end.',
  },
  {
    title: 'Provider-agnostic by design',
    blurb: 'Route across LLM/voice vendors; bring your own keys or use ours. Never locked in.',
  },
  {
    title: 'Cost on every call',
    blurb: 'STT + LLM + TTS + telephony metered per call, per tenant — margins you can see.',
  },
];

/** The surfaces the same agent serves (Days 44 + 93). */
export const LANDING_CHANNELS = [
  'Phone',
  'Web',
  'SIP',
  'WhatsApp',
  'SMS',
  'Telegram',
  'Messenger',
  'Instagram',
  'RCS',
] as const;

export interface PricingTier {
  name: string;
  /** Monthly price in whole USD (0 = free). */
  priceUsd: number;
  tagline: string;
  highlights: string[];
  /** The recommended tier — visually featured. */
  featured?: boolean;
}

/** The pricing teaser — mirrors the seeded plan ladder + Day-94 advanced-tier entitlements. */
export const LANDING_PRICING: PricingTier[] = [
  {
    name: 'Free',
    priceUsd: 0,
    tagline: 'Kick the tyres',
    highlights: ['1 agent', '30 minutes included', 'Web + phone', 'Community support'],
  },
  {
    name: 'Pro',
    priceUsd: 99,
    tagline: 'For growing teams',
    highlights: [
      '10 agents · 1,000 minutes',
      'All channels (Telegram, WhatsApp, RCS…)',
      'Real-time translation + co-pilot',
      'Analytics, benchmarking & automations',
    ],
    featured: true,
  },
  {
    name: 'Scale',
    priceUsd: 499,
    tagline: 'For platforms & enterprises',
    highlights: [
      '50 agents · 6,000 minutes',
      'Video avatars + voice biometrics',
      'Developer API & marketplace',
      'White-label reseller + SSO',
    ],
  },
];

/** Format a tier's price for display, e.g. `Free` or `$99/mo`. Pure. */
export function formatTierPrice(tier: PricingTier): string {
  return tier.priceUsd === 0 ? 'Free' : `$${tier.priceUsd}/mo`;
}
