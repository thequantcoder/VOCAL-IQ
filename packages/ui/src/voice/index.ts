/**
 * @vocaliq/ui/voice — signature voice-motion primitives (UX-04). The motion vocabulary the product is
 * about: an amplitude-reactive waveform, an agent-presence orb, a conversation/turn-taking viz, a live
 * transcript stream, and small status indicators — all driven by the shared `useAgentState` machine and
 * reduced-motion-aware. Kept in a subpath (like `/motion`) so the canvas/framer weight only loads where
 * voice UI is used.
 */
export {
  type AgentState,
  AGENT_STATES,
  activeSpeaker,
  useAgentState,
  useSimulatedAgent,
} from './use-agent-state';
export { LiveWaveform, type LiveWaveformProps } from './live-waveform';
export { VoiceOrb, type VoiceOrbProps } from './voice-orb';
export { ConversationViz, type ConversationVizProps } from './conversation-viz';
export { TranscriptStream, type TranscriptTurn } from './transcript-stream';
export { ThinkingDots, ListeningPulse } from './indicators';
