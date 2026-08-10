import { describe, expect, it } from 'vitest';
import {
  haversineKm,
  nearestVoiceRegion,
  parseVoiceRegions,
  resolveScaleBackends,
} from './scale.js';

describe('resolveScaleBackends', () => {
  it('uses operational defaults with no scale env', () => {
    const b = resolveScaleBackends({});
    expect(b.analytics).toBe('timescale');
    expect(b.vectors).toBe('pgvector');
    expect(b.multiRegionVoice).toBe(false);
  });
  it('switches to clickhouse/qdrant + multi-region when configured', () => {
    const b = resolveScaleBackends({
      CLICKHOUSE_URL: 'http://ch:8123',
      QDRANT_URL: 'http://qdrant:6333',
      VOICE_REGIONS: 'us-east,eu-west',
    } as NodeJS.ProcessEnv);
    expect(b.analytics).toBe('clickhouse');
    expect(b.vectors).toBe('qdrant');
    expect(b.multiRegionVoice).toBe(true);
  });
});

describe('parseVoiceRegions', () => {
  it('parses an allow-list and drops unknowns, defaulting to us-east', () => {
    expect(parseVoiceRegions('eu-west, ap-south, bogus').map((r) => r.id)).toEqual([
      'eu-west',
      'ap-south',
    ]);
    expect(parseVoiceRegions(undefined).map((r) => r.id)).toEqual(['us-east']);
    expect(parseVoiceRegions('bogus').map((r) => r.id)).toEqual(['us-east']);
  });
});

describe('nearestVoiceRegion (multi-region routing — self-audit F)', () => {
  const active = parseVoiceRegions('us-east,eu-west,ap-south');
  it('routes a European caller to eu-west', () => {
    const r = nearestVoiceRegion({ lat: 48.9, lon: 2.4 }, active); // Paris
    expect(r.id).toBe('eu-west');
  });
  it('routes an Indian caller to ap-south', () => {
    const r = nearestVoiceRegion({ lat: 19.0, lon: 72.8 }, active); // Mumbai
    expect(r.id).toBe('ap-south');
  });
  it('routes a US caller to us-east', () => {
    const r = nearestVoiceRegion({ lat: 40.7, lon: -74.0 }, active); // NYC
    expect(r.id).toBe('us-east');
  });
  it('falls back to the first active region when location is unknown', () => {
    expect(nearestVoiceRegion(null, active).id).toBe('us-east');
  });
});

describe('haversineKm', () => {
  it('is ~0 for the same point and large across continents', () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(0);
    expect(haversineKm({ lat: 40.7, lon: -74 }, { lat: 51.5, lon: -0.1 })).toBeGreaterThan(5000);
  });
});
