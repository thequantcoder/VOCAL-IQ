import { type ReleaseManifest, type UpdateStatus, computeUpdateStatus } from '@vocaliq/shared';

/** A minimal fetch-like port so the service is unit-testable offline (mirrors the connector pattern). */
export type UpdateHttp = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const defaultHttp: UpdateHttp = (url) => fetch(url, { signal: AbortSignal.timeout(5000) });

/**
 * Self-host "Check for Updates" (PARITY-11). Reads the installed version (baked in at build via
 * `APP_VERSION`, or a fallback) and fetches a published release manifest to tell the operator whether
 * a newer version exists — **read-only, never auto-applies** (safe by default: it only reports +
 * links the changelog). Manifest-fetch/parse failures degrade to `reachable:false` (never throws).
 * Hosted-SaaS is unaffected: without a manifest URL it simply reports "up to date / couldn't check".
 */
export class UpdateService {
  constructor(
    private readonly current: string,
    private readonly manifestUrl: string | undefined,
    private readonly http: UpdateHttp = defaultHttp,
  ) {}

  /** The installed version (source of truth for the UI + the compare). */
  version(): string {
    return this.current;
  }

  async check(): Promise<UpdateStatus> {
    const manifest = await this.fetchManifest();
    return computeUpdateStatus(this.current, manifest);
  }

  private async fetchManifest(): Promise<ReleaseManifest | null> {
    if (!this.manifestUrl) return null;
    try {
      const res = await this.http(this.manifestUrl);
      if (!res.ok) return null;
      const body = (await res.json()) as Partial<ReleaseManifest> | null;
      if (!body || typeof body.latest !== 'string' || !body.latest.trim()) return null;
      return {
        latest: body.latest,
        ...(typeof body.notes === 'string' ? { notes: body.notes } : {}),
        ...(typeof body.minCompatible === 'string' ? { minCompatible: body.minCompatible } : {}),
        ...(typeof body.releasedAt === 'string' ? { releasedAt: body.releasedAt } : {}),
        ...(typeof body.url === 'string' ? { url: body.url } : {}),
      };
    } catch {
      // Network/timeout/parse error → treated as unreachable (self-audit E: never break the console).
      return null;
    }
  }
}

/** Resolve the installed version: `APP_VERSION` (baked at build) → fallback. */
export function resolveAppVersion(env: NodeJS.ProcessEnv, fallback = '0.0.0'): string {
  const v = env.APP_VERSION?.trim();
  return v && v.length > 0 ? v : fallback;
}
