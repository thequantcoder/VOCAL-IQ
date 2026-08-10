import { z } from 'zod';

/**
 * Scale-out configuration (Day 62) — pure backend selection + multi-region voice routing shared
 * across api/voice/workers. The platform runs on operational defaults (Postgres/Timescale +
 * pgvector + a single voice region) and scales OUT to ClickHouse (event analytics), Qdrant (large
 * vector workloads), and multi-region voice — each behind a provider-style seam so switching is a
 * config change (golden rule #2), never a rewrite. This module decides WHICH backend is active
 * from env and routes a call to the nearest media region.
 */

// ── Backend selection ────────────────────────────────────────────────────────

export type AnalyticsBackend = 'timescale' | 'clickhouse';
export type VectorBackend = 'pgvector' | 'qdrant';

export interface ScaleBackends {
  analytics: AnalyticsBackend;
  vectors: VectorBackend;
  /** Multi-region voice is on when more than one media region is configured. */
  multiRegionVoice: boolean;
}

/**
 * Resolve the active backends from env. ClickHouse takes over analytics when `CLICKHOUSE_URL` is
 * set; Qdrant takes over vectors when `QDRANT_URL` is set; otherwise the operational defaults.
 */
export function resolveScaleBackends(env: NodeJS.ProcessEnv = {}): ScaleBackends {
  return {
    analytics: env.CLICKHOUSE_URL ? 'clickhouse' : 'timescale',
    vectors: env.QDRANT_URL ? 'qdrant' : 'pgvector',
    multiRegionVoice: parseVoiceRegions(env.VOICE_REGIONS).length > 1,
  };
}

// ── Multi-region voice routing ───────────────────────────────────────────────

export interface VoiceRegion {
  id: string;
  /** Approx geo for nearest-region routing (lat/lon). */
  lat: number;
  lon: number;
  /** The LiveKit/media host for this region. */
  mediaHost: string;
}

/** Built-in media regions. The active set is narrowed by the `VOICE_REGIONS` env allow-list. */
export const VOICE_REGIONS: VoiceRegion[] = [
  { id: 'us-east', lat: 38.9, lon: -77.0, mediaHost: 'media.us-east.livekit.vocaliq.net' },
  { id: 'us-west', lat: 45.5, lon: -122.7, mediaHost: 'media.us-west.livekit.vocaliq.net' },
  { id: 'eu-west', lat: 53.3, lon: -6.2, mediaHost: 'media.eu-west.livekit.vocaliq.net' },
  { id: 'eu-central', lat: 50.1, lon: 8.7, mediaHost: 'media.eu-central.livekit.vocaliq.net' },
  { id: 'ap-south', lat: 19.1, lon: 72.9, mediaHost: 'media.ap-south.livekit.vocaliq.net' },
  {
    id: 'ap-southeast',
    lat: -33.9,
    lon: 151.2,
    mediaHost: 'media.ap-southeast.livekit.vocaliq.net',
  },
];

const VOICE_BY_ID = new Map(VOICE_REGIONS.map((r) => [r.id, r]));

/** Parse the `VOICE_REGIONS` env allow-list (comma-separated ids); defaults to us-east only. */
export function parseVoiceRegions(raw: string | undefined): VoiceRegion[] {
  const ids = (raw ?? 'us-east')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => VOICE_BY_ID.has(s));
  const regions = ids.map((id) => VOICE_BY_ID.get(id)!);
  return regions.length > 0 ? regions : [VOICE_BY_ID.get('us-east')!];
}

/** Great-circle-ish distance (haversine) in km — good enough for nearest-region selection. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Pick the nearest active voice region to a caller location. Falls back to the first active region
 * when no location is known. Deterministic — ties broken by region order.
 */
export function nearestVoiceRegion(
  callerLoc: { lat: number; lon: number } | null,
  active: VoiceRegion[],
): VoiceRegion {
  const pool = active.length > 0 ? active : [VOICE_REGIONS[0]!];
  if (!callerLoc) return pool[0]!;
  let best = pool[0]!;
  let bestKm = haversineKm(callerLoc, best);
  for (const r of pool.slice(1)) {
    const km = haversineKm(callerLoc, r);
    if (km < bestKm) {
      best = r;
      bestKm = km;
    }
  }
  return best;
}

export const analyticsEventSchema = z.object({
  tenantId: z.string().uuid(),
  event: z.string().min(1).max(64),
  ts: z.number().int().nonnegative(),
  props: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
