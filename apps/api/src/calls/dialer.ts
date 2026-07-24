/**
 * Telephony dispatch seam. The api decides WHETHER a call may be placed (quota, DNC,
 * consent, concurrency) and records it; the actual PSTN dial + LiveKit bridge happens
 * in the voice service. `Dialer` is that boundary so the api stays provider-agnostic
 * and fully testable — the live HTTP dialer to the voice service is injected in prod,
 * a fake in tests. (Twilio itself is exercised in the voice service, Day 10 live.)
 */

export interface DialRequest {
  tenantId: string;
  callId: string;
  agentId: string;
  /** Destination in E.164 (already validated + gate-checked). */
  to: string;
  /** Optional caller-id override (a tenant PhoneNumber e164). */
  from?: string;
  flowVersionId?: string;
}

export interface Dialer {
  /** Hand the vetted call to the voice service to dial + bridge into the loop. */
  dial(req: DialRequest): Promise<void>;
}

/** DI token for the active Dialer implementation. */
export const DIALER = Symbol('DIALER');

/**
 * Default dialer until the voice-service dial endpoint + funded Twilio number are live
 * (see memory: twilio-live-test-pending). It records intent and no-ops the PSTN leg, so
 * outbound orchestration + gates ship + test now without placing real calls.
 */
export class PendingDialer implements Dialer {
  readonly dispatched: DialRequest[] = [];

  async dial(req: DialRequest): Promise<void> {
    this.dispatched.push(req);
  }
}

export interface HttpDialerOptions {
  /** Base URL of the voice service (internal network), e.g. `http://voice:8000`. */
  voiceServiceUrl: string;
  /** Shared secret sent as `X-Internal-Secret` — must match the voice service's `VOICE_INTERNAL_SECRET`. */
  internalSecret: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Optional log sink for a failed dial (never receives the secret). */
  onError?: (message: string) => void;
}

/**
 * Live dialer: hands the vetted outbound call to the voice service's internal PSTN dial endpoint
 * (Twilio dial → media bridge into the loop). Gated + fail-soft, mirroring HttpVoiceDispatcher /
 * HttpWaMediaControl: wired only when `VOICE_SERVICE_URL` + `VOICE_INTERNAL_SECRET` are set; any
 * non-2xx / timeout / unreachable voice service is swallowed (the Call stays QUEUED for the
 * reconciliation sweep) so `placeCall` never crashes on a voice hiccup. Never logs the secret.
 *
 * The voice-side `POST /calls/dial` + a funded carrier number are the remaining go-live pieces
 * (carrier-gated — see memory: twilio-live-test-pending). Until they land this is inert (the gate
 * keeps PendingDialer in place); the api's outbound gates + orchestration are already complete.
 */
export class HttpDialer implements Dialer {
  constructor(private readonly opts: HttpDialerOptions) {}

  async dial(req: DialRequest): Promise<void> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 8000);
    try {
      const res = await fetchImpl(`${this.opts.voiceServiceUrl}/calls/dial`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': this.opts.internalSecret,
        },
        body: JSON.stringify({
          call_id: req.callId,
          tenant_id: req.tenantId,
          agent_id: req.agentId,
          to: req.to,
          ...(req.from ? { from: req.from } : {}),
          ...(req.flowVersionId ? { flow_version_id: req.flowVersionId } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.opts.onError?.(`voice dial returned ${res.status} for call ${req.callId}`);
      }
    } catch (err) {
      this.opts.onError?.(
        `voice dial failed for call ${req.callId}: ${err instanceof Error ? err.message : 'unreachable'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
