import { Provider, ProviderError } from '@vocaliq/shared';
import type { MediaProvider } from '../index.js';

/**
 * LiveKit real-time media. SCAFFOLD — body lands with LIVEKIT_* creds + live
 * verification.
 *
 * TODO(Day 07 live): livekit-server-sdk — RoomServiceClient.createRoom,
 * AccessToken(apiKey, apiSecret).addGrant({roomJoin, room}).toJwt() for `token`.
 */
export class LiveKitMedia implements MediaProvider {
  readonly provider = Provider.LIVEKIT;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  private notImplemented(): never {
    void this.url;
    void this.apiKey;
    void this.apiSecret;
    throw new ProviderError(
      'LiveKit media adapter not yet implemented (pending live verification)',
    );
  }

  async createRoom(_name: string): Promise<{ room: string }> {
    return this.notImplemented();
  }
  async token(_room: string, _identity: string): Promise<string> {
    return this.notImplemented();
  }
}
