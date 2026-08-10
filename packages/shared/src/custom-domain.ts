import { z } from 'zod';

/**
 * Custom domains (Day 52, Cloudflare for SaaS). Resellers serve the app on their own hostname
 * with automatic SSL. The hostname validation + the provisioning-status model live here (pure);
 * the api talks to Cloudflare via an injected client (gated — activates when the zone id + token
 * are set) and resolves an inbound hostname → its tenant + theme (self-audit B + C).
 */

/** A custom-hostname lifecycle status (mirrors Cloudflare's ssl/hostname states, simplified). */
export type DomainStatus =
  | 'pending' // created, awaiting the CNAME + validation
  | 'pending_validation'
  | 'active' // hostname active + SSL issued
  | 'failed';

export interface DomainConfig {
  hostname: string;
  status: DomainStatus;
  /** The CNAME target the reseller points their domain at (the platform's fallback origin). */
  cnameTarget: string;
  /** SSL certificate status, when known. */
  sslStatus?: string;
  cloudflareId?: string;
}

// Public-suffix-agnostic hostname check: labels of a-z0-9 (with internal hyphens), 2+ labels,
// no scheme/path/port, ≤253 chars. Rejects localhost/IPs (not a delegatable public hostname).
const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** A structurally-valid, delegatable public hostname (not localhost, not a bare IPv4). */
function looksLikeHostname(h: string): boolean {
  return HOSTNAME_RE.test(h) && !IPV4_RE.test(h) && !h.endsWith('.localhost');
}

export const customDomainInputSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .refine(looksLikeHostname, 'must be a valid public domain'),
});
export type CustomDomainInput = z.infer<typeof customDomainInputSchema>;

/** Normalise a hostname for storage/lookup: lowercase, strip a `www.` prefix + a trailing dot. */
export function normalizeHostname(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

/** Valid public hostname? (same rule as the schema, reusable outside Zod.) */
export function isValidHostname(hostname: string): boolean {
  return looksLikeHostname(normalizeHostname(hostname));
}
