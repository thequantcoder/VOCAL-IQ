import { z } from 'zod';

/**
 * Call cost/reliability guards (Day 38). Protects margin against runaway calls: a hard
 * max-duration cap and a silence/dead-air cutoff so a stuck or abandoned call can't burn
 * credits indefinitely. Pure + unit-tested; the voice loop evaluates `shouldAutoHangup`
 * on a timer and ends the call with the returned reason.
 */

export const TURN_TIMEOUT_MIN_MS = 500; // slider floor (0.5s)
export const TURN_TIMEOUT_MAX_MS = 5000; // slider ceiling (5.0s)

/** Clamp a per-agent turn timeout to the supported 0.5–5.0s window. */
export function clampTurnTimeoutMs(ms: number): number {
  if (!Number.isFinite(ms)) return 1500;
  return Math.min(TURN_TIMEOUT_MAX_MS, Math.max(TURN_TIMEOUT_MIN_MS, Math.round(ms)));
}

export const callGuardSchema = z.object({
  /** Hard cap on total call length; the call is ended when exceeded. */
  maxCallDurationSec: z.number().int().min(30).max(7200).default(600),
  /** Continuous dead-air before auto-hangup (0 disables the silence cutoff). */
  maxSilenceSec: z.number().int().min(0).max(120).default(15),
  /** End the call if answering-machine/voicemail is detected. */
  endOnVoicemail: z.boolean().default(true),
});
export type CallGuard = z.infer<typeof callGuardSchema>;

export const DEFAULT_CALL_GUARD: CallGuard = {
  maxCallDurationSec: 600,
  maxSilenceSec: 15,
  endOnVoicemail: true,
};

export type HangupReason = 'max_duration' | 'silence' | 'voicemail';

export interface CallGuardState {
  /** Total elapsed call time. */
  elapsedMs: number;
  /** Continuous silence since the last speech from either party. */
  silenceMs: number;
  /** Whether voicemail/answering-machine was detected on this call. */
  voicemailDetected?: boolean;
}

export interface HangupDecision {
  hangup: boolean;
  reason?: HangupReason;
}

/**
 * Decide whether a call should be auto-ended given the live guard state. Order of
 * precedence: voicemail → max duration → silence. `maxSilenceSec = 0` disables the
 * silence cutoff. Returns the first triggered reason so the loop can log why it ended.
 */
export function shouldAutoHangup(state: CallGuardState, guard: CallGuard): HangupDecision {
  if (guard.endOnVoicemail && state.voicemailDetected) {
    return { hangup: true, reason: 'voicemail' };
  }
  if (state.elapsedMs >= guard.maxCallDurationSec * 1000) {
    return { hangup: true, reason: 'max_duration' };
  }
  if (guard.maxSilenceSec > 0 && state.silenceMs >= guard.maxSilenceSec * 1000) {
    return { hangup: true, reason: 'silence' };
  }
  return { hangup: false };
}

/** Human-readable label for a hangup reason (analytics / call log). */
export function hangupReasonLabel(reason: HangupReason): string {
  switch (reason) {
    case 'max_duration':
      return 'Reached maximum call duration';
    case 'silence':
      return 'Ended after prolonged silence';
    case 'voicemail':
      return 'Voicemail detected';
  }
}
