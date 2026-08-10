import { z } from 'zod';
import type { SentimentSignal } from './sentiment-rules.js';

/**
 * Emotion-aware voice modulation (Day 77) — pure policy + mapping shared across voice/api/web.
 *
 * The live loop estimates the caller's mood per turn as a {@link SentimentSignal} (the same shape
 * Day 73 defined) and this module turns `(signal, policy)` into provider-agnostic
 * {@link ExpressiveSettings} that shape HOW the agent speaks the *next* line — empathetic and
 * steady when the caller is sad, calm and de-escalating when they're angry, brighter for good news.
 *
 * Three properties are non-negotiable and encoded here:
 *  - A (appropriateness, self-audit A): an upset caller NEVER hears a fast, exaggerated, "cheerful"
 *    voice. De-escalation always wins over enthusiasm, and expressive extremes are clamped. This is
 *    the whole point of the feature and is enforced structurally (precedence) AND defensively
 *    (guardrails) so a bad policy can't produce a tone-deaf voice.
 *  - F (no added latency, self-audit F): everything here is pure, allocation-light arithmetic. It
 *    changes the `voice_settings` on the SAME TTS call — no extra provider round-trip, no model
 *    call, so it costs nothing and adds no latency (golden rule #4 — modulation never bills).
 *  - Determinism: same input → same settings, so the whole thing unit-tests without live keys and
 *    the Python voice loop mirrors it exactly.
 */

/**
 * The four vocal strategies the agent can adopt. Ordered by caller distress: `reassuring` (angry)
 * and `empathetic` (sad) are the "care" tones; `upbeat` is for genuinely positive moments; `neutral`
 * is the professional default the agent falls back to.
 */
export const EMOTION_TONES = ['neutral', 'empathetic', 'reassuring', 'upbeat'] as const;
export type EmotionTone = (typeof EMOTION_TONES)[number];

/** How far the voice is allowed to move from neutral. `subtle` barely colours it; `expressive` leans in. */
export const EXPRESSIVENESS_LEVELS = ['subtle', 'balanced', 'expressive'] as const;
export type Expressiveness = (typeof EXPRESSIVENESS_LEVELS)[number];

/**
 * Provider-agnostic expressive controls. The ElevenLabs adapter maps these onto `voice_settings`
 * (stability / similarity_boost / style / speed / use_speaker_boost); other TTS providers map onto
 * their own knobs. All are normalised: 0..1 except `speed` (a rate multiplier).
 */
export interface ExpressiveSettings {
  /** Steadiness. Higher = calmer, more consistent; lower = more dynamic/emotive. */
  stability: number;
  /** Fidelity to the base voice timbre. Kept near the voice default; nudged up for warmth. */
  similarityBoost: number;
  /** Expressiveness / exaggeration. 0 = flat/measured; higher = more animated. */
  style: number;
  /** Speaking-rate multiplier. <1 slows down (empathy/de-escalation); >1 adds energy. */
  speed: number;
  /** Clarity boost — on for the coloured tones so warmth/energy still reads clearly. */
  useSpeakerBoost: boolean;
}

/** The professional default every call starts from and falls back to (also the ElevenLabs default). */
export const NEUTRAL_SETTINGS: ExpressiveSettings = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  speed: 1,
  useSpeakerBoost: false,
};

/** Per-tone target deltas from neutral at `balanced`. Scaled by expressiveness, then clamped. */
const TONE_TARGETS: Record<EmotionTone, ExpressiveSettings> = {
  neutral: NEUTRAL_SETTINGS,
  // Sad/negative caller: warmer, steadier, a touch slower — caring, unhurried.
  empathetic: {
    stability: 0.68,
    similarityBoost: 0.8,
    style: 0.12,
    speed: 0.96,
    useSpeakerBoost: true,
  },
  // Angry/frustrated caller: maximally steady, no exaggeration, measured pace — de-escalate.
  reassuring: {
    stability: 0.82,
    similarityBoost: 0.78,
    style: 0,
    speed: 0.93,
    useSpeakerBoost: true,
  },
  // Positive caller / good news / buying intent: brighter, more animated, a little quicker.
  upbeat: {
    stability: 0.38,
    similarityBoost: 0.75,
    style: 0.45,
    speed: 1.05,
    useSpeakerBoost: true,
  },
};

const EXPRESSIVENESS_SCALE: Record<Expressiveness, number> = {
  subtle: 0.5,
  balanced: 1,
  expressive: 1.4,
};

/** Absolute bounds so no policy/expressiveness can push the voice into unnatural territory. */
const BOUNDS = {
  stability: [0.15, 0.95],
  similarityBoost: [0.5, 0.9],
  style: [0, 1],
  speed: [0.85, 1.12],
} as const;

/**
 * Per-agent emotion policy. Disabled by default (opt-in) so nothing changes for existing agents. The
 * thresholds decide when the caller counts as angry / negative / positive; `expressiveness` and
 * `maxStyle` bound how far the voice moves and cap exaggeration (the appropriateness guardrail).
 */
export const emotionPolicySchema = z.object({
  enabled: z.boolean().default(false),
  expressiveness: z.enum(EXPRESSIVENESS_LEVELS).default('balanced'),
  /** Hard cap on `style` for EVERY tone — the main dial against an over-acted voice (self-audit A). */
  maxStyle: z.number().min(0).max(1).default(0.6),
  /** anger/frustration ≥ this ⇒ de-escalate (reassuring). */
  angerThreshold: z.number().min(0).max(1).default(0.5),
  /** sentimentScore ≤ this ⇒ empathetic. */
  negativeThreshold: z.number().min(-1).max(0).default(-0.35),
  /** sentimentScore ≥ this (and not angry) ⇒ upbeat. */
  positiveThreshold: z.number().min(0).max(1).default(0.4),
});
export type EmotionPolicy = z.infer<typeof emotionPolicySchema>;

/** The default policy (disabled) — what an agent with no configured policy resolves to. */
export const DEFAULT_EMOTION_POLICY: EmotionPolicy = emotionPolicySchema.parse({});

/** Parse an unknown stored blob (Agent.emotionPolicy JSON) into a valid policy, falling back to defaults. */
export function parseEmotionPolicy(raw: unknown): EmotionPolicy {
  const parsed = emotionPolicySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_EMOTION_POLICY;
}

function clamp(value: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Decide the vocal strategy for a caller turn. Precedence is the appropriateness contract:
 * distress (anger, then sadness) is handled BEFORE positivity, so an angry or upset caller can never
 * be classified `upbeat`. Returns `neutral` when the policy is disabled or the caller is level.
 */
export function classifyTone(signal: SentimentSignal, policy: EmotionPolicy): EmotionTone {
  if (!policy.enabled) return 'neutral';
  if (signal.anger >= policy.angerThreshold || signal.frustration >= policy.angerThreshold)
    return 'reassuring';
  if (signal.sentimentScore <= policy.negativeThreshold) return 'empathetic';
  if (signal.sentimentScore >= policy.positiveThreshold) return 'upbeat';
  return 'neutral';
}

/**
 * Resolve concrete {@link ExpressiveSettings} for a tone under a policy. Interpolates from neutral
 * toward the tone target by the expressiveness scale, clamps to natural bounds and to `maxStyle`,
 * then applies the care-tone guardrail: for `empathetic`/`reassuring` the voice is never sped up and
 * never animated (style capped low) — an upset caller always hears a calm, unhurried voice
 * regardless of how the policy is tuned (self-audit A). Pure + deterministic.
 */
export function resolveExpressiveSettings(
  tone: EmotionTone,
  policy: EmotionPolicy,
): ExpressiveSettings {
  if (tone === 'neutral') return { ...NEUTRAL_SETTINGS };
  const target = TONE_TARGETS[tone];
  const scale = EXPRESSIVENESS_SCALE[policy.expressiveness];
  const lerp = (from: number, to: number) => from + (to - from) * scale;

  let stability = clamp(lerp(NEUTRAL_SETTINGS.stability, target.stability), BOUNDS.stability);
  const similarityBoost = clamp(
    lerp(NEUTRAL_SETTINGS.similarityBoost, target.similarityBoost),
    BOUNDS.similarityBoost,
  );
  let style = clamp(
    Math.min(lerp(NEUTRAL_SETTINGS.style, target.style), policy.maxStyle),
    BOUNDS.style,
  );
  let speed = clamp(lerp(NEUTRAL_SETTINGS.speed, target.speed), BOUNDS.speed);

  // Care-tone guardrail: an upset caller must never get a fast or exaggerated voice.
  if (tone === 'empathetic' || tone === 'reassuring') {
    speed = Math.min(speed, 1);
    style = Math.min(style, 0.2);
    // De-escalation stays extra steady even at `subtle`.
    stability = Math.max(stability, tone === 'reassuring' ? 0.7 : 0.6);
  }

  return {
    stability,
    similarityBoost,
    style,
    speed,
    useSpeakerBoost: target.useSpeakerBoost,
  };
}

/** One-shot convenience: caller mood + policy → the settings for the next spoken line. */
export function modulate(
  signal: SentimentSignal,
  policy: EmotionPolicy,
): { tone: EmotionTone; settings: ExpressiveSettings } {
  const tone = classifyTone(signal, policy);
  return { tone, settings: resolveExpressiveSettings(tone, policy) };
}
