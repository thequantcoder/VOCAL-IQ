import type { DomainStatus } from '@vocaliq/shared';

/**
 * Cloudflare for SaaS custom-hostname client (Day 52). Provisions a reseller's domain + issues
 * automatic SSL. GATED: built only when `CLOUDFLARE_SAAS_ZONE_ID` + `CLOUDFLARE_API_TOKEN` are
 * set — with none configured the white-label service still records the domain + returns the
 * CNAME instructions (status `pending`), so the app runs without Cloudflare. HTTP is injected
 * so the client is unit-testable offline; the token is read from env and never logged.
 */

export interface CfCustomHostname {
  id: string;
  status: DomainStatus;
  sslStatus?: string;
}

export interface CloudflareClient {
  readonly configured: boolean;
  readonly cnameTarget: string;
  createCustomHostname(hostname: string): Promise<CfCustomHostname>;
  getCustomHostname(id: string): Promise<CfCustomHostname>;
}

export type HttpClient = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const fetchHttp: HttpClient = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(8000) });

/** Map Cloudflare's hostname/ssl status strings to our simplified lifecycle. */
function mapStatus(raw: { status?: string; ssl?: { status?: string } }): DomainStatus {
  const ssl = raw.ssl?.status;
  if (raw.status === 'active' && (ssl === 'active' || ssl === undefined)) return 'active';
  if (raw.status === 'pending' || ssl === 'pending_validation') return 'pending_validation';
  if (raw.status === 'active') return 'pending_validation'; // hostname up, SSL not yet
  return raw.status === 'blocked' || ssl === 'timed_out' ? 'failed' : 'pending';
}

/** A disabled client (no creds) — the service falls back to CNAME-only instructions. */
export function disabledCloudflare(cnameTarget: string): CloudflareClient {
  return {
    configured: false,
    cnameTarget,
    async createCustomHostname() {
      throw new Error('Cloudflare for SaaS is not configured');
    },
    async getCustomHostname() {
      throw new Error('Cloudflare for SaaS is not configured');
    },
  };
}

/** Build the live client if configured, else the disabled one (gated). */
export function buildCloudflareClient(
  env: NodeJS.ProcessEnv,
  http: HttpClient = fetchHttp,
): CloudflareClient {
  const zoneId = env.CLOUDFLARE_SAAS_ZONE_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  const cnameTarget = env.CUSTOM_DOMAIN_CNAME_TARGET ?? 'cname.vocaliq.dev';
  if (!zoneId || !token) return disabledCloudflare(cnameTarget);

  const base = `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames`;
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  async function call(url: string, method: string, body?: unknown): Promise<CfCustomHostname> {
    const res = await http(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Cloudflare ${res.status}: ${text.slice(0, 200)}`);
    const data = JSON.parse(text) as {
      result?: { id: string; status?: string; ssl?: { status?: string } };
    };
    const r = data.result;
    if (!r?.id) throw new Error('Cloudflare returned no hostname id');
    return {
      id: r.id,
      status: mapStatus(r),
      ...(r.ssl?.status ? { sslStatus: r.ssl.status } : {}),
    };
  }

  return {
    configured: true,
    cnameTarget,
    createCustomHostname: (hostname) =>
      call(base, 'POST', { hostname, ssl: { method: 'http', type: 'dv' } }),
    getCustomHostname: (id) => call(`${base}/${id}`, 'GET'),
  };
}
