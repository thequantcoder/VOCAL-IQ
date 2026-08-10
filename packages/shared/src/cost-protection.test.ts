import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CALL_GUARD,
  callGuardSchema,
  clampTurnTimeoutMs,
  shouldAutoHangup,
} from './cost-protection.js';

describe('clampTurnTimeoutMs', () => {
  it('clamps to the 0.5–5.0s window and defaults on NaN', () => {
    expect(clampTurnTimeoutMs(100)).toBe(500);
    expect(clampTurnTimeoutMs(9000)).toBe(5000);
    expect(clampTurnTimeoutMs(1500)).toBe(1500);
    expect(clampTurnTimeoutMs(Number.NaN)).toBe(1500);
  });
});

describe('callGuardSchema', () => {
  it('applies sensible defaults', () => {
    expect(callGuardSchema.parse({})).toEqual(DEFAULT_CALL_GUARD);
  });
  it('rejects an out-of-range duration', () => {
    expect(callGuardSchema.safeParse({ maxCallDurationSec: 5 }).success).toBe(false);
  });
});

describe('shouldAutoHangup', () => {
  const guard = { maxCallDurationSec: 600, maxSilenceSec: 15, endOnVoicemail: true };

  it('does not hang up a healthy in-progress call', () => {
    expect(shouldAutoHangup({ elapsedMs: 60_000, silenceMs: 2_000 }, guard).hangup).toBe(false);
  });

  it('ends on max duration', () => {
    expect(shouldAutoHangup({ elapsedMs: 600_000, silenceMs: 0 }, guard)).toEqual({
      hangup: true,
      reason: 'max_duration',
    });
  });

  it('ends on prolonged silence', () => {
    expect(shouldAutoHangup({ elapsedMs: 30_000, silenceMs: 15_000 }, guard)).toEqual({
      hangup: true,
      reason: 'silence',
    });
  });

  it('silence cutoff can be disabled with maxSilenceSec = 0', () => {
    const g = { ...guard, maxSilenceSec: 0 };
    expect(shouldAutoHangup({ elapsedMs: 30_000, silenceMs: 99_000 }, g).hangup).toBe(false);
  });

  it('voicemail takes precedence and honours the toggle', () => {
    expect(
      shouldAutoHangup({ elapsedMs: 1_000, silenceMs: 0, voicemailDetected: true }, guard).reason,
    ).toBe('voicemail');
    expect(
      shouldAutoHangup(
        { elapsedMs: 1_000, silenceMs: 0, voicemailDetected: true },
        { ...guard, endOnVoicemail: false },
      ).hangup,
    ).toBe(false);
  });
});
