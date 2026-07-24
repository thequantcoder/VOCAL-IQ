/**
 * Voice-agent dispatch seam for the web widget (Day 16 → live).
 *
 * The widget mints the visitor's LiveKit token + opens a WEB Call; this seam then tells the
 * voice service to put the AI agent into the SAME room so the visitor has someone to talk to.
 * It mirrors the WhatsApp/Messenger media-control pattern: a gated + fail-soft HTTP hop to the
 * voice service, wired only when `VOICE_SERVICE_URL` + `VOICE_INTERNAL_SECRET` are set. Until
 * then `PendingVoiceDispatcher` records intent and no-ops — the room + token still return, so
 * the widget works (agent joins once the voice deploy is wired). Going live is a config swap.
 */

export interface VoiceDispatchRequest {
  tenantId: string;
  callId: string;
  agentId: string;
  /** The LiveKit room the visitor already holds a token for (the agent must join THIS room). */
  room: string;
}

export interface VoiceDispatcher {
  /** Ask the voice service to join `room` as the AI agent. Never throws into the caller. */
  dispatchAgent(req: VoiceDispatchRequest): Promise<void>;
}

/**
 * Default until the voice-service dispatch endpoint is wired (see memory: local-dev-run).
 * Records intent so orchestration + tests ship now without a running voice service; the
 * room/token are already returned to the browser, so only the agent leg is pending.
 */
export class PendingVoiceDispatcher implements VoiceDispatcher {
  readonly dispatched: VoiceDispatchRequest[] = [];

  async dispatchAgent(req: VoiceDispatchRequest): Promise<void> {
    this.dispatched.push(req);
  }
}

export interface HttpVoiceDispatcherOptions {
  /** Base URL of the voice service (internal network), e.g. `http://voice:8000`. */
  voiceServiceUrl: string;
  /** Shared secret sent as `X-Internal-Secret` — must match the voice service's `VOICE_INTERNAL_SECRET`. */
  internalSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Optional log sink for a failed dispatch (never receives the secret). */
  onError?: (message: string) => void;
}

/**
 * The live dispatcher: POSTs to the voice service's internal dispatch endpoint so the agent
 * worker joins the widget's room. Gated + fail-soft — any non-2xx, timeout, or unreachable
 * voice service is swallowed (the widget session is already valid; the agent simply doesn't
 * join). Never logs the secret. Wired only when `VOICE_SERVICE_URL` + `VOICE_INTERNAL_SECRET`
 * are set (mirrors HttpWaMediaControl / HttpMeMediaControl).
 */
export class HttpVoiceDispatcher implements VoiceDispatcher {
  constructor(private readonly opts: HttpVoiceDispatcherOptions) {}

  async dispatchAgent(req: VoiceDispatchRequest): Promise<void> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 8000);
    try {
      const res = await fetchImpl(`${this.opts.voiceServiceUrl}/calls/dispatch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': this.opts.internalSecret,
        },
        body: JSON.stringify({
          call_id: req.callId,
          tenant_id: req.tenantId,
          agent_id: req.agentId,
          room: req.room,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.opts.onError?.(`voice dispatch returned ${res.status} for call ${req.callId}`);
      }
    } catch (err) {
      // Fail-soft: the widget session is already valid; only the agent leg is missing.
      this.opts.onError?.(
        `voice dispatch failed for call ${req.callId}: ${err instanceof Error ? err.message : 'unreachable'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
