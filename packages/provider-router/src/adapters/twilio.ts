import { Provider, ProviderError } from '@vocaliq/shared';
import type { DialResult, TelephonyProvider } from '../index.js';

/**
 * Twilio telephony. SCAFFOLD — body lands with TWILIO_* creds + live verification
 * (Day 10 is the first real outbound call).
 *
 * TODO(Day 10 live): Twilio Voice REST — calls.create (dial), <Dial>/transfer,
 * calls(sid).update({status:'completed'}) (hangup). Cost metered on call minutes.
 */
export class TwilioTelephony implements TelephonyProvider {
  readonly provider = Provider.TWILIO;
  readonly capability = 'telephony' as const;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
  ) {}

  private notImplemented(): never {
    void this.accountSid;
    void this.authToken;
    throw new ProviderError(
      'Twilio telephony adapter not yet implemented (pending live verification)',
    );
  }

  async dial(_to: string, _from: string, _opts?: Record<string, unknown>): Promise<DialResult> {
    return this.notImplemented();
  }
  async answer(_callId: string): Promise<void> {
    this.notImplemented();
  }
  async transfer(_callId: string, _to: string): Promise<void> {
    this.notImplemented();
  }
  async hangup(_callId: string): Promise<void> {
    this.notImplemented();
  }
}
