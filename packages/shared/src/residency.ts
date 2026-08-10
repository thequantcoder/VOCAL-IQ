import { z } from 'zod';

/**
 * Data residency (Day 61) — pure region catalog + resolution shared across api/voice/workers. A
 * tenant can pin its data + processing to a region; the platform routes DB/storage/voice to the
 * matching regional endpoints. Keeping the catalog + resolution pure makes residency routing
 * unit-testable and identical across services. For single-tenant VPC installs, the whole deploy
 * is pinned to one region with zero cross-region egress (see infra/terraform).
 */

export interface RegionInfo {
  id: string;
  label: string;
  /** Coarse jurisdiction — drives residency legality checks. */
  jurisdiction: 'US' | 'EU' | 'UK' | 'APAC' | 'CA' | 'AU';
  /** Endpoint hints the platform uses to route regional infra (host suffixes, not secrets). */
  storageHost: string;
  voiceHost: string;
}

/** The supported data regions. Adding one is a config change here, not a code rewrite. */
export const DATA_REGIONS: RegionInfo[] = [
  {
    id: 'us-east-1',
    label: 'US East (N. Virginia)',
    jurisdiction: 'US',
    storageHost: 'storage.us-east-1.vocaliq.net',
    voiceHost: 'voice.us-east-1.vocaliq.net',
  },
  {
    id: 'us-west-2',
    label: 'US West (Oregon)',
    jurisdiction: 'US',
    storageHost: 'storage.us-west-2.vocaliq.net',
    voiceHost: 'voice.us-west-2.vocaliq.net',
  },
  {
    id: 'eu-west-1',
    label: 'EU (Ireland)',
    jurisdiction: 'EU',
    storageHost: 'storage.eu-west-1.vocaliq.net',
    voiceHost: 'voice.eu-west-1.vocaliq.net',
  },
  {
    id: 'eu-central-1',
    label: 'EU (Frankfurt)',
    jurisdiction: 'EU',
    storageHost: 'storage.eu-central-1.vocaliq.net',
    voiceHost: 'voice.eu-central-1.vocaliq.net',
  },
  {
    id: 'uk-south-1',
    label: 'UK (London)',
    jurisdiction: 'UK',
    storageHost: 'storage.uk-south-1.vocaliq.net',
    voiceHost: 'voice.uk-south-1.vocaliq.net',
  },
  {
    id: 'ap-south-1',
    label: 'Asia Pacific (Mumbai)',
    jurisdiction: 'APAC',
    storageHost: 'storage.ap-south-1.vocaliq.net',
    voiceHost: 'voice.ap-south-1.vocaliq.net',
  },
  {
    id: 'ap-southeast-2',
    label: 'Asia Pacific (Sydney)',
    jurisdiction: 'AU',
    storageHost: 'storage.ap-southeast-2.vocaliq.net',
    voiceHost: 'voice.ap-southeast-2.vocaliq.net',
  },
  {
    id: 'ca-central-1',
    label: 'Canada (Central)',
    jurisdiction: 'CA',
    storageHost: 'storage.ca-central-1.vocaliq.net',
    voiceHost: 'voice.ca-central-1.vocaliq.net',
  },
];

export const REGION_IDS = DATA_REGIONS.map((r) => r.id);
const REGION_BY_ID = new Map(DATA_REGIONS.map((r) => [r.id, r]));

export const DEFAULT_REGION = 'us-east-1';

/** The default data region the platform is deployed in (single-tenant VPC pins this via env). */
export function platformRegion(env: NodeJS.ProcessEnv = {}): string {
  const r = env.DATA_REGION;
  return r && REGION_BY_ID.has(r) ? r : DEFAULT_REGION;
}

export function isRegionAllowed(region: string): boolean {
  return REGION_BY_ID.has(region);
}

export function regionInfo(region: string): RegionInfo | undefined {
  return REGION_BY_ID.get(region);
}

/** Per-tenant residency config. `strictEgress` forbids any processing outside the pinned region. */
export const residencyConfigSchema = z.object({
  region: z.string().refine(isRegionAllowed, 'Unknown data region'),
  strictEgress: z.boolean().default(false),
});
export type ResidencyConfig = z.infer<typeof residencyConfigSchema>;

/**
 * Resolve the effective region for a tenant: its pinned region if set + valid, else the platform
 * default. Never returns an unknown region (falls back), so routing can't dead-end.
 */
export function resolveRegion(pinned: string | null | undefined, platformDefault: string): string {
  if (pinned && isRegionAllowed(pinned)) return pinned;
  return isRegionAllowed(platformDefault) ? platformDefault : DEFAULT_REGION;
}

/** The regional endpoints (storage + voice hosts) a service should use for `region`. */
export function regionEndpoints(region: string): {
  storageHost: string;
  voiceHost: string;
  region: string;
} {
  const info = REGION_BY_ID.get(region) ?? REGION_BY_ID.get(DEFAULT_REGION)!;
  return { storageHost: info.storageHost, voiceHost: info.voiceHost, region: info.id };
}

/**
 * Is a tenant's pinned region compatible with a data subject's jurisdiction? E.g. an EU subject's
 * data must stay in an EU region under strict residency. Returns true when residency isn't strict
 * or the jurisdictions match.
 */
export function residencyPermits(
  config: ResidencyConfig,
  requiredJurisdiction: RegionInfo['jurisdiction'],
): boolean {
  if (!config.strictEgress) return true;
  const info = REGION_BY_ID.get(config.region);
  return info?.jurisdiction === requiredJurisdiction;
}
