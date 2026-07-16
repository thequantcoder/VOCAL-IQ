/**
 * The control-channel contract between the api (signaling) and the voice service (WebRTC media) for
 * WhatsApp calls (WAC-02). The api receives the caller's SDP offer on the `calls` webhook and needs
 * an SDP answer within the ~30–60 s accept window; the voice-service WebRTC bridge (WAC-03) produces
 * it. Injected so the api stays media-agnostic + testable. WAC-02 ships the {@link PendingWaMediaControl}
 * stub (no answer yet) — real media lands in WAC-03.
 */
export interface WaAnswerRequest {
  tenantId: string;
  callId: string;
  sdpOffer: string;
  /** The agent/flow to answer with (resolved in WAC-04; optional until then). */
  agentId?: string;
}

export interface WaMediaControl {
  /** Ask the voice service for an SDP answer to the caller's offer. `null` = media not ready/available. */
  requestSdpAnswer(req: WaAnswerRequest): Promise<string | null>;
  /** Tear down the media leg for a call (on terminate). Best-effort. */
  endCall(callId: string): Promise<void>;
}

/** WAC-02 placeholder: no WebRTC media yet, so no SDP answer. Replaced by the real bridge in WAC-03. */
export class PendingWaMediaControl implements WaMediaControl {
  async requestSdpAnswer(): Promise<string | null> {
    return null;
  }
  async endCall(): Promise<void> {
    /* no-op until WAC-03 */
  }
}
