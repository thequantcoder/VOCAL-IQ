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

export interface HttpWaMediaControlOptions {
  /** Base URL of the voice service (internal network), e.g. `http://voice:8000`. */
  voiceServiceUrl: string;
  /** Shared secret sent as `X-Internal-Secret` — must match the voice service's `VOICE_INTERNAL_SECRET`. */
  internalSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * WAC-03: the real media control — calls the voice service's internal WebRTC-bridge endpoints to get
 * an SDP answer for the caller's offer (and to tear the peer down on terminate). Gated + fail-soft: any
 * non-200 (503 when the voice bridge is unconfigured), a timeout, or an unreachable voice service
 * returns `null`/no-op so the webhook path never throws and the call simply stays `connecting`. Never
 * logs the SDP or the secret. Wired only when `VOICE_SERVICE_URL` + `VOICE_INTERNAL_SECRET` are set.
 */
export class HttpWaMediaControl implements WaMediaControl {
  constructor(private readonly opts: HttpWaMediaControlOptions) {}

  async requestSdpAnswer(req: WaAnswerRequest): Promise<string | null> {
    const body = await this.post('/calls/whatsapp/answer', {
      call_id: req.callId,
      sdp_offer: req.sdpOffer,
      tenant_id: req.tenantId,
      agent_id: req.agentId ?? '',
    });
    const answer = (body as { sdp_answer?: unknown } | null)?.sdp_answer;
    return typeof answer === 'string' && answer.length > 0 ? answer : null;
  }

  async endCall(callId: string): Promise<void> {
    await this.post('/calls/whatsapp/end', { call_id: callId });
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<unknown | null> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 8000);
    try {
      const res = await fetchImpl(`${this.opts.voiceServiceUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': this.opts.internalSecret,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) return null; // gated (503) / unauthorized / bridge error → no answer
      return await res.json();
    } catch {
      return null; // voice unreachable / aborted — fail soft (call stays connecting)
    } finally {
      clearTimeout(timer);
    }
  }
}
