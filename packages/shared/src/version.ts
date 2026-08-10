/**
 * Release versioning + "Check for Updates" (PARITY-11) — the pure core. A self-hosted install knows
 * its own VERSION and compares it to a published release manifest to tell the operator whether an
 * update is available. No I/O here (the fetch lives in the api, injected) so the compare logic is
 * exhaustively unit-tested and identical across api/web.
 */

export interface ReleaseManifest {
  /** The latest published version, e.g. "1.2.0". */
  latest: string;
  /** Human-readable release notes / changelog summary. */
  notes?: string;
  /** Oldest installed version that can upgrade directly to `latest` (below → a stepped upgrade). */
  minCompatible?: string;
  /** ISO date the release was published. */
  releasedAt?: string;
  /** Where to read the full changelog / download. */
  url?: string;
}

export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  /** The installed version is older than the manifest's `minCompatible` — needs a stepped upgrade. */
  belowMinCompatible: boolean;
  notes?: string;
  url?: string;
  releasedAt?: string;
  /** False when the manifest could not be fetched/parsed — the UI shows "couldn't check". */
  reachable: boolean;
}

/** Parse "v1.2.3-beta.1" → [1,2,3] (leading `v` + any pre-release/build suffix ignored). */
export function parseSemver(v: string): [number, number, number] {
  const cleaned = v.trim().replace(/^v/i, '');
  const core = cleaned.split(/[-+]/)[0] ?? '';
  const parts = core.split('.').map((n) => Number.parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** Compare two versions by major.minor.patch: -1 if a<b, 0 if equal, 1 if a>b. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Derive the update status from the installed version + a fetched manifest (null = unreachable).
 * Pure: the api fetches the manifest and passes it in. Never throws.
 */
export function computeUpdateStatus(
  current: string,
  manifest: ReleaseManifest | null,
): UpdateStatus {
  if (!manifest || !manifest.latest) {
    return {
      current,
      latest: null,
      updateAvailable: false,
      belowMinCompatible: false,
      reachable: false,
    };
  }
  const updateAvailable = compareSemver(manifest.latest, current) > 0;
  const belowMinCompatible = manifest.minCompatible
    ? compareSemver(current, manifest.minCompatible) < 0
    : false;
  return {
    current,
    latest: manifest.latest,
    updateAvailable,
    belowMinCompatible,
    ...(manifest.notes ? { notes: manifest.notes } : {}),
    ...(manifest.url ? { url: manifest.url } : {}),
    ...(manifest.releasedAt ? { releasedAt: manifest.releasedAt } : {}),
    reachable: true,
  };
}
