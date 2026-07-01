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
