import { LATENCY_SLO } from './latency.js';

/**
 * Speech-to-speech (S2S) mode (Day 65) — pure eligibility + latency modelling shared across
 * api/voice. A direct audio-to-audio model (e.g. OpenAI Realtime) collapses the STT→LLM→TTS
 * pipeline into one hop for the lowest latency, but only SUPPORTS simple flows (no tool calls,
 * RAG, transfers, or complex branching, and a supported language). This module decides, per flow,
 * whether S2S is safe to use and estimates the latency saved (self-audit F); the API gates the
 * live provider behind a key and falls back to the pipeline otherwise.
 */

/** Providers that expose a direct audio-to-audio model. */
export const S2S_PROVIDERS = ['OPENAI_REALTIME', 'GEMINI_LIVE'] as const;
export type S2sProvider = (typeof S2S_PROVIDERS)[number];

/** Flow characteristics that determine S2S eligibility. */
export interface FlowFeatures {
  hasTools: boolean;
  hasRag: boolean;
  hasTransfer: boolean;
  hasComplexBranching: boolean;
  language: string;
}

export type S2sMode = 's2s' | 'pipeline';

export interface S2sDecision {
  mode: S2sMode;
  eligible: boolean;
  reason: string;
  /** Estimated ms saved per turn vs the STT→LLM→TTS pipeline (0 when falling back). */
  estimatedSavingMs: number;
}

/** Languages the S2S models handle well; others fall back to the pipeline (better multilingual). */
export const S2S_SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt'];

/**
 * Decide the mode for a flow. S2S is used ONLY when the flow is simple (no tools/RAG/transfer/
 * complex branching) and the language is supported AND a provider is available; otherwise the
 * reliable STT→LLM→TTS pipeline. The first disqualifying reason is returned for observability.
 */
export function decideS2sMode(flow: FlowFeatures, providerAvailable: boolean): S2sDecision {
  const pipeline = (reason: string): S2sDecision => ({
    mode: 'pipeline',
    eligible: false,
    reason,
    estimatedSavingMs: 0,
  });

  if (!providerAvailable) return pipeline('no S2S provider configured');
  if (flow.hasTools) return pipeline('flow uses tools (needs the LLM tool loop)');
  if (flow.hasRag) return pipeline('flow uses RAG (needs retrieval + grounding)');
  if (flow.hasTransfer) return pipeline('flow can transfer (needs orchestration)');
  if (flow.hasComplexBranching) return pipeline('flow has complex branching');
  const lang = flow.language.slice(0, 2).toLowerCase();
  if (!S2S_SUPPORTED_LANGUAGES.includes(lang)) {
    return pipeline(`language ${lang} not supported for S2S`);
  }
  return {
    mode: 's2s',
    eligible: true,
    reason: 'simple flow — direct audio-to-audio',
    estimatedSavingMs: estimateS2sSavingMs(),
  };
}

/**
 * Estimate the per-turn latency saved by S2S: the pipeline serializes STT-final → LLM TTFT →
 * TTS TTFA; S2S produces audio directly, so it removes the STT + TTS first-token legs (the LLM
 * "thinking" leg still exists inside the model). Modelled from the Day-63 SLO budgets.
 */
export function estimateS2sSavingMs(): number {
  return LATENCY_SLO.stt + LATENCY_SLO.ttsTtfa;
}
