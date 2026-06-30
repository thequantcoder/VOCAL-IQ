import { Provider, ProviderError } from '@vocaliq/shared';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { MediaProvider } from '../index.js';

/**
 * LiveKit real-time media (rooms + join tokens). `createRoom` provisions the WebRTC
 * room the caller and the Pipecat agent join; `token` mints a signed join credential
 * for a participant. Verified live against the project's LiveKit Cloud instance.
 *
 * Media itself is not metered here — telephony minutes (Twilio) and STT/TTS units are
 * the billable signals; LiveKit Cloud is a flat platform cost (DATA-MODEL cost engine).
 */
export class LiveKitMedia implements MediaProvider {
  readonly provider = Provider.LIVEKIT;
  private readonly rooms: RoomServiceClient;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {
    // RoomServiceClient speaks HTTP(S); the public URL is ws(s):// — normalise it.
    const httpUrl = url.replace(/^ws/, 'http');
    this.rooms = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  }

  async createRoom(name: string): Promise<{ room: string }> {
    try {
      const room = await this.rooms.createRoom({ name });
      return { room: room.name };
    } catch (cause) {
      throw new ProviderError('LiveKit room creation failed', { cause });
    }
  }

  async token(room: string, identity: string): Promise<string> {
    try {
      const at = new AccessToken(this.apiKey, this.apiSecret, { identity });
      at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
      return await at.toJwt();
    } catch (cause) {
      throw new ProviderError('LiveKit token minting failed', { cause });
    }
  }

  /** The public ws(s):// URL clients dial to join — exposed for the call response. */
  get serverUrl(): string {
    return this.url;
  }
}
