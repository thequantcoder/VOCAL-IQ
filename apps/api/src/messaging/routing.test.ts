import { describe, expect, it } from 'vitest';
import {
  ProviderHealth,
  type ProviderRoute,
  SmartRouter,
  countryFromPhone,
  orderProviders,
  providerRoutes,
} from './routing';

/** GME-03: the pure smart-routing engine — least-cost ordering, country coverage, health ejection. */

const route = (
  id: string,
  price: number,
  countries: 'global' | string[] = 'global',
): ProviderRoute => ({ id, channel: 'SMS', countries, routingPriceUsd: price });

describe('orderProviders', () => {
  it('orders cheapest-first by default (least_cost)', () => {
    const cands = [route('a', 0.01), route('b', 0.003), route('c', 0.007)];
    expect(orderProviders(cands, {})).toEqual(['b', 'c', 'a']);
  });

  it('filters by country coverage (global always matches)', () => {
    const cands = [route('glob', 0.01), route('india', 0.001, ['IN']), route('us', 0.002, ['US'])];
    expect(orderProviders(cands, { country: 'IN' })).toEqual(['india', 'glob']);
    expect(orderProviders(cands, { country: 'US' })).toEqual(['us', 'glob']);
  });

  it('drops unhealthy providers', () => {
    const cands = [route('a', 0.001), route('b', 0.002)];
    expect(orderProviders(cands, { unhealthy: new Set(['a']) })).toEqual(['b']);
  });

  it('honours a preferred order under the priority strategy', () => {
    const cands = [route('a', 0.01), route('b', 0.001)];
    expect(orderProviders(cands, { strategy: 'priority', preferred: ['a', 'b'] })).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('ProviderHealth', () => {
  it('ejects after the failure threshold, then recovers past the cooldown', () => {
    let t = 1000;
    const h = new ProviderHealth(3, 500, () => t);
    h.record('x', false);
    h.record('x', false);
    expect(h.isEjected('x')).toBe(false);
    h.record('x', false); // 3rd consecutive failure → ejected
    expect(h.isEjected('x')).toBe(true);
    expect(h.ejectedSet().has('x')).toBe(true);
    t += 600; // past cooldown
    expect(h.isEjected('x')).toBe(false);
  });

  it('a success clears the failure streak', () => {
    const h = new ProviderHealth(2, 100, () => 0);
    h.record('y', false);
    h.record('y', true); // reset
    h.record('y', false);
    expect(h.isEjected('y')).toBe(false);
  });
});

describe('SmartRouter + providerRoutes', () => {
  it('returns the configured providers for a channel', () => {
    expect(providerRoutes('SMS').map((r) => r.id)).toContain('twilio');
    expect(providerRoutes('WHATSAPP').map((r) => r.id)).toContain('whatsapp-cloud');
  });

  it('selectChain returns a chain for the channel', () => {
    expect(new SmartRouter().selectChain('SMS')).toContain('twilio');
  });
});

describe('India SMS routing (GME-05)', () => {
  it('countryFromPhone detects India (+91)', () => {
    expect(countryFromPhone('+919812345678')).toBe('IN');
    expect(countryFromPhone('+14155550100')).toBeUndefined();
  });

  it('routes an India (+91) SMS to the cheapest India carrier first, global as failover', () => {
    const chain = new SmartRouter().selectChain('SMS', 'IN');
    expect(chain[0]).toBe('fast2sms'); // cheapest India carrier (GME-10, 0.0015 < msg91 0.0018)
    // India DLT carriers (msg91/gupshup GME-05, fast2sms/route-mobile/kaleyra/textlocal GME-10)
    // all precede the global providers, which stay in the chain for failover.
    for (const p of ['msg91', 'gupshup', 'route-mobile', 'kaleyra', 'textlocal']) {
      expect(chain).toContain(p);
      expect(chain.indexOf(p)).toBeLessThan(chain.indexOf('twilio'));
    }
    expect(chain).toContain('twilio'); // global still in the chain for failover
  });

  it('routes a non-India SMS to global providers only (India carriers filtered out)', () => {
    const chain = new SmartRouter().selectChain('SMS'); // unknown country
    expect(chain).not.toContain('msg91');
    expect(chain).not.toContain('gupshup');
    expect(chain).toContain('twilio');
  });

  it('orders global SMS cheapest-first (GME-07: telnyx < plivo < vonage < twilio)', () => {
    const chain = new SmartRouter().selectChain('SMS'); // global carriers only
    expect(chain[0]).toBe('telnyx');
    expect(chain.indexOf('plivo')).toBeLessThan(chain.indexOf('twilio'));
  });
});
