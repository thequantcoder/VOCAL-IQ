import {
  type ScaleBackends,
  type VoiceRegion,
  nearestVoiceRegion,
  parseVoiceRegions,
  resolveScaleBackends,
} from '@vocaliq/shared';

/**
 * Scale-out status + multi-region voice routing (Day 62). Reports which storage backends are
 * active (Timescale/ClickHouse for analytics, pgvector/Qdrant for vectors) and routes a call to
 * the nearest active media region for low latency (self-audit F). Pure decisions come from
 * @vocaliq/shared; here we read env once and expose them to the API + voice service.
 */
export class ScaleService {
  private readonly backends: ScaleBackends;
  private readonly regions: VoiceRegion[];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.backends = resolveScaleBackends(env);
    this.regions = parseVoiceRegions(env.VOICE_REGIONS);
  }

  /** Active backends + configured voice regions (ops/status surface). */
  status(): { backends: ScaleBackends; regions: { id: string; mediaHost: string }[] } {
    return {
      backends: this.backends,
      regions: this.regions.map((r) => ({ id: r.id, mediaHost: r.mediaHost })),
    };
  }

  /**
   * Resolve the media region + host for a call from an optional caller location. The voice service
   * connects the call to this region's LiveKit host so audio takes the shortest path.
   */
  resolveVoiceRegion(callerLoc: { lat: number; lon: number } | null): {
    region: string;
    mediaHost: string;
  } {
    const r = nearestVoiceRegion(callerLoc, this.regions);
    return { region: r.id, mediaHost: r.mediaHost };
  }
}
