import { z } from 'zod';

/**
 * AI disclosure & calling-rules compliance (Day 71) — pure, region-aware rules shared across
 * api/voice. AI-disclosure laws ("you're speaking with an AI assistant") + a mandatory human
 * opt-out + TCPA-style calling hours/frequency caps are enforced platform-wide so every tenant
 * inherits them. Keeping the rulebook pure makes disclosure text, calling-window, and frequency
 * decisions deterministic + testable; the voice service speaks the disclosure, the outbound path
 * enforces the window, and every disclosure is logged for a defensible record.
 */

export interface RegionRule {
  region: string;
  /** Must the AI verbally disclose it's an AI at call start? */
  disclosureRequired: boolean;
  /** Is an always-available "reach a human" opt-out legally mandatory (can't be disabled)? */
  humanOptOutRequired: boolean;
  /** Local allowed calling window (24h clock, inclusive start, exclusive end). */
  callingHours: { start: number; end: number };
  /** Max call attempts to the same contact per day (frequency cap). */
  maxAttemptsPerDay: number;
}

/** Pre-built compliance rule sets (the template library). Operators pick per region/tenant. */
export const COMPLIANCE_TEMPLATES: Record<string, RegionRule> = {
  'US-TCPA': {
    region: 'US',
    disclosureRequired: true,
    humanOptOutRequired: true,
    callingHours: { start: 8, end: 21 },
    maxAttemptsPerDay: 3,
  },
  'US-CA': {
    region: 'US-CA',
    disclosureRequired: true,
    humanOptOutRequired: true,
    callingHours: { start: 8, end: 21 },
    maxAttemptsPerDay: 3,
  },
  'EU-GDPR': {
    region: 'EU',
    disclosureRequired: true,
    humanOptOutRequired: true,
    callingHours: { start: 9, end: 20 },
    maxAttemptsPerDay: 2,
  },
  GB: {
    region: 'GB',
    disclosureRequired: true,
    humanOptOutRequired: true,
    callingHours: { start: 8, end: 21 },
    maxAttemptsPerDay: 3,
  },
  DEFAULT: {
    region: 'DEFAULT',
    disclosureRequired: false,
    humanOptOutRequired: false,
    callingHours: { start: 8, end: 21 },
    maxAttemptsPerDay: 5,
  },
};

/** Resolve the rule set for a region (by template key or region code), else the default. */
export function rulesForRegion(region: string | null | undefined): RegionRule {
  if (!region) return COMPLIANCE_TEMPLATES.DEFAULT!;
  const up = region.toUpperCase();
  if (COMPLIANCE_TEMPLATES[up]) return COMPLIANCE_TEMPLATES[up]!;
  const byRegion = Object.values(COMPLIANCE_TEMPLATES).find((r) => r.region.toUpperCase() === up);
  return byRegion ?? COMPLIANCE_TEMPLATES.DEFAULT!;
}

export const disclosureConfigSchema = z.object({
  region: z.string().max(10).default('DEFAULT'),
  /** Custom disclosure line; if empty, a default is generated. */
  customText: z.string().max(300).optional(),
  /** Keyword the caller can say to reach a human (in addition to DTMF "1"). */
  humanKeyword: z.string().max(20).default('human'),
});
export type DisclosureConfig = z.infer<typeof disclosureConfigSchema>;

/**
 * Build the spoken AI-disclosure line the agent says at call start. Includes the human opt-out
 * instruction when required by the region. Returns null when no disclosure is required (and none
 * is customized) — the voice service then skips it.
 */
export function buildDisclosure(
  config: DisclosureConfig,
  agentName: string,
  businessName?: string,
): string | null {
  const rule = rulesForRegion(config.region);
  if (!rule.disclosureRequired && !config.customText) return null;
  const who = businessName ? ` from ${businessName}` : '';
  const base = config.customText ?? `Hi, this is ${agentName}${who}, an AI assistant.`;
  if (rule.humanOptOutRequired) {
    return `${base} You can press 1 or say "${config.humanKeyword}" at any time to reach a person.`;
  }
  return base;
}

/** Is the current local hour within the region's allowed calling window? */
export function isWithinCallingHours(region: string, localHour: number): boolean {
  const { start, end } = rulesForRegion(region).callingHours;
  return localHour >= start && localHour < end;
}

/** Has the per-day contact-attempt frequency cap been reached for this region? */
export function frequencyAllowed(region: string, attemptsToday: number): boolean {
  return attemptsToday < rulesForRegion(region).maxAttemptsPerDay;
}

/**
 * The single calling-rules gate the outbound path calls: allowed only when inside the calling
 * window AND under the frequency cap. Returns the blocking reason otherwise.
 */
export function callingAllowed(
  region: string,
  args: { localHour: number; attemptsToday: number },
): { allowed: boolean; reason?: string } {
  if (!isWithinCallingHours(region, args.localHour)) {
    const { start, end } = rulesForRegion(region).callingHours;
    return {
      allowed: false,
      reason: `outside allowed calling hours (${start}:00–${end}:00 local)`,
    };
  }
  if (!frequencyAllowed(region, args.attemptsToday)) {
    return { allowed: false, reason: 'daily contact frequency cap reached' };
  }
  return { allowed: true };
}
