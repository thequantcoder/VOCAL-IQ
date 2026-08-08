import type { MessageChannel } from '@vocaliq/shared';
import { MESSAGING_PROVIDER_SPECS } from './provider-specs';

/**
 * Smart routing for the messaging engine (GME-03). Picks an ORDERED chain of providers to try for a
 * message — cheapest healthy first, filtered by country coverage — and the send path falls over down
 * the chain on a hard failure. Health is tracked in-memory (a provider with a burst of failures is
 * ejected for a cooldown). With one provider per channel today the chain has one entry; when GME-05+
 * adds MSG91/Vonage/… the same engine load-balances + fails over across them (golden rule: routing).
 */

export interface ProviderRoute {
  id: string;
  channel: MessageChannel;
  /** ISO country codes the provider covers, or 'global'. */
  countries: 'global' | string[];
  /** Per-message price used for least-cost ordering (a routing hint — the billed cost is metered separately). */
  routingPriceUsd: number;
}

export type RoutingStrategy = 'least_cost' | 'priority';

// Routing metadata per provider (coverage + price). Kept separate from the credential specs; extend
// as GME-05+ adds providers. Global for now; India providers (GME-05/10) will carry `['IN']`.
const PROVIDER_ROUTES: Record<string, { countries: 'global' | string[]; routingPriceUsd: number }> =
  {
    twilio: { countries: 'global', routingPriceUsd: 0.0079 },
    // India SMS (GME-05) — cheaper than Twilio for +91, so they win least-cost for India numbers.
    msg91: { countries: ['IN'], routingPriceUsd: 0.0018 },
    gupshup: { countries: ['IN'], routingPriceUsd: 0.002 },
    'whatsapp-cloud': { countries: 'global', routingPriceUsd: 0.005 },
    telegram: { countries: 'global', routingPriceUsd: 0 },
    messenger: { countries: 'global', routingPriceUsd: 0 },
    instagram: { countries: 'global', routingPriceUsd: 0 },
    'rcs-gateway': { countries: 'global', routingPriceUsd: 0.007 },
  };

/**
 * Minimal E.164 → ISO country detection for routing (GME-05) — today India (+91), which is what the
 * India carriers (MSG91/Gupshup) cover; expand as more regional providers land. Unknown → undefined
 * → only global providers are considered.
 */
export function countryFromPhone(to: string): string | undefined {
  if (to.startsWith('+91')) return 'IN';
  return undefined;
}

/** The candidate providers for a channel (from the specs + their routing metadata). */
export function providerRoutes(channel: MessageChannel): ProviderRoute[] {
  return Object.values(MESSAGING_PROVIDER_SPECS)
    .filter((s) => s.channel === channel)
    .map((s) => {
      const r = PROVIDER_ROUTES[s.id] ?? { countries: 'global' as const, routingPriceUsd: 0 };
      return {
        id: s.id,
        channel: s.channel,
        countries: r.countries,
        routingPriceUsd: r.routingPriceUsd,
      };
    });
}

function coversCountry(route: ProviderRoute, country?: string): boolean {
  // A global provider always matches. A country-restricted provider (e.g. India-only MSG91) matches
  // ONLY when the destination country is known AND covered — so an unknown-country send never routes
  // to a restricted carrier (it falls to the global providers).
  if (route.countries === 'global') return true;
  return country ? route.countries.includes(country.toUpperCase()) : false;
}

/**
 * Pure routing decision: filter candidates by country coverage + health, then order them (cheapest
 * first by default; a `preferred` order wins under the `priority` strategy). Returns the ordered
 * provider-id chain the send path tries in turn.
 */
export function orderProviders(
  candidates: ProviderRoute[],
  ctx: {
    country?: string | undefined;
    strategy?: RoutingStrategy | undefined;
    preferred?: string[] | undefined;
    unhealthy?: Set<string> | undefined;
  },
): string[] {
  const strategy = ctx.strategy ?? 'least_cost';
  const unhealthy = ctx.unhealthy;
  const list = candidates
    .filter((c) => coversCountry(c, ctx.country))
    .filter((c) => !unhealthy?.has(c.id));

  const preferred = ctx.preferred;
  const sorted = [...list].sort((a, b) => {
    if (strategy === 'priority' && preferred) {
      const ai = preferred.indexOf(a.id);
      const bi = preferred.indexOf(b.id);
      const an = ai === -1 ? Number.POSITIVE_INFINITY : ai;
      const bn = bi === -1 ? Number.POSITIVE_INFINITY : bi;
      if (an !== bn) return an - bn;
    }
    return a.routingPriceUsd - b.routingPriceUsd; // least-cost (also the priority tie-break)
  });
  return sorted.map((c) => c.id);
}

/**
 * In-memory provider health with failure-burst ejection (mirrors the Day-38 key-pool idea). A
 * provider that fails `threshold` times in a row is ejected from routing for `cooldownMs`; any
 * success clears it. Single-node; a Redis-backed store replaces it at scale.
 */
export class ProviderHealth {
  private readonly stats = new Map<string, { failures: number; ejectedUntil: number }>();

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  record(providerId: string, ok: boolean): void {
    const s = this.stats.get(providerId) ?? { failures: 0, ejectedUntil: 0 };
    if (ok) {
      s.failures = 0;
      s.ejectedUntil = 0;
    } else {
      s.failures += 1;
      if (s.failures >= this.threshold) s.ejectedUntil = this.now() + this.cooldownMs;
    }
    this.stats.set(providerId, s);
  }

  isEjected(providerId: string): boolean {
    const s = this.stats.get(providerId);
    return s ? s.ejectedUntil > this.now() : false;
  }

  ejectedSet(): Set<string> {
    const t = this.now();
    const out = new Set<string>();
    for (const [id, s] of this.stats) if (s.ejectedUntil > t) out.add(id);
    return out;
  }
}

/** The router seam the send path depends on (an interface so tests can inject a fake chain). */
export interface MessageRouter {
  /** Ordered provider-id chain to try for a message on this channel/country. */
  selectChain(channel: MessageChannel, country?: string): string[];
  /** Report a send outcome so unhealthy providers get ejected. */
  record(providerId: string, ok: boolean): void;
}

export class SmartRouter implements MessageRouter {
  constructor(private readonly health: ProviderHealth = new ProviderHealth()) {}

  selectChain(channel: MessageChannel, country?: string): string[] {
    return orderProviders(providerRoutes(channel), {
      country,
      strategy: 'least_cost',
      unhealthy: this.health.ejectedSet(),
    });
  }

  record(providerId: string, ok: boolean): void {
    this.health.record(providerId, ok);
  }
}
