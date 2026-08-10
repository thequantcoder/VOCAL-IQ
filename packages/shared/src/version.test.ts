import { describe, expect, it } from 'vitest';
import { compareSemver, computeUpdateStatus, parseSemver } from './version.js';

describe('parseSemver', () => {
  it('parses versions, ignoring a leading v and pre-release/build suffixes', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
    expect(parseSemver('v2.0.0')).toEqual([2, 0, 0]);
    expect(parseSemver('1.4.0-beta.2')).toEqual([1, 4, 0]);
    expect(parseSemver('1.2')).toEqual([1, 2, 0]);
  });
});

describe('compareSemver', () => {
  it('orders by major.minor.patch', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
    expect(compareSemver('1.2.0', '1.1.9')).toBe(1);
    expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1); // numeric, not lexical
  });
});

describe('computeUpdateStatus', () => {
  it('reports an available update when the manifest is newer', () => {
    const s = computeUpdateStatus('1.1.0', { latest: '1.2.0', notes: 'New stuff' });
    expect(s.updateAvailable).toBe(true);
    expect(s.latest).toBe('1.2.0');
    expect(s.notes).toBe('New stuff');
    expect(s.reachable).toBe(true);
    expect(s.belowMinCompatible).toBe(false);
  });

  it('reports up to date when installed >= latest', () => {
    expect(computeUpdateStatus('1.2.0', { latest: '1.2.0' }).updateAvailable).toBe(false);
    expect(computeUpdateStatus('1.3.0', { latest: '1.2.0' }).updateAvailable).toBe(false);
  });

  it('flags below-min-compatible for a stepped upgrade', () => {
    const s = computeUpdateStatus('1.0.0', { latest: '2.0.0', minCompatible: '1.5.0' });
    expect(s.updateAvailable).toBe(true);
    expect(s.belowMinCompatible).toBe(true);
  });

  it('degrades gracefully when the manifest is unreachable (null)', () => {
    const s = computeUpdateStatus('1.1.0', null);
    expect(s.reachable).toBe(false);
    expect(s.updateAvailable).toBe(false);
    expect(s.latest).toBeNull();
  });
});
