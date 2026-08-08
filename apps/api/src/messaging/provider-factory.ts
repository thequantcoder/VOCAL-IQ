import { GupshupSmsSender } from './adapters/gupshup';
import { InfobipSmsSender } from './adapters/infobip';
import { MessageBirdSmsSender } from './adapters/messagebird';
import { Msg91SmsSender } from './adapters/msg91';
import { PlivoSmsSender } from './adapters/plivo';
import { SinchSmsSender } from './adapters/sinch';
import { TelnyxSmsSender } from './adapters/telnyx';
import { VonageSmsSender } from './adapters/vonage';
import {
  type HttpClient,
  type MessageSender,
  MetaMessagingSender,
  RcsSender,
  TelegramSender,
  TwilioSmsSender,
  WhatsAppSender,
  fetchHttp,
} from './senders';

/**
 * Construct a messaging provider adapter from a resolved credential set (GME-02a). This is the ONE
 * place a provider id + creds become a live adapter — used by the send path with per-tenant BYOK
 * creds (resolved from the vault), so a tenant's own keys actually drive the send. Adding a provider
 * = one `case` here + its spec + its adapter class (golden rule: provider-agnostic by routing).
 */
export type ProviderFactory = (
  providerId: string,
  creds: Record<string, string>,
  http?: HttpClient,
) => MessageSender | null;

export const createMessagingProvider: ProviderFactory = (providerId, creds, http = fetchHttp) => {
  switch (providerId) {
    case 'twilio':
      return new TwilioSmsSender(
        creds.accountSid ?? '',
        creds.authToken ?? '',
        creds.from ?? '',
        http,
      );
    case 'msg91':
      return new Msg91SmsSender(creds.authKey ?? '', creds.sender ?? '', creds.flowId ?? '', http);
    case 'gupshup':
      return new GupshupSmsSender(
        creds.userId ?? '',
        creds.password ?? '',
        creds.sender ?? '',
        http,
      );
    case 'vonage':
      return new VonageSmsSender(creds.apiKey ?? '', creds.apiSecret ?? '', creds.from ?? '', http);
    case 'plivo':
      return new PlivoSmsSender(creds.authId ?? '', creds.authToken ?? '', creds.from ?? '', http);
    case 'telnyx':
      return new TelnyxSmsSender(creds.apiKey ?? '', creds.from ?? '', http);
    case 'sinch':
      return new SinchSmsSender(
        creds.servicePlanId ?? '',
        creds.token ?? '',
        creds.from ?? '',
        http,
      );
    case 'messagebird':
      return new MessageBirdSmsSender(creds.accessKey ?? '', creds.from ?? '', http);
    case 'infobip':
      return new InfobipSmsSender(
        creds.baseUrl ?? '',
        creds.apiKey ?? '',
        creds.from ?? '',
        http,
      );
    case 'whatsapp-cloud':
      return new WhatsAppSender(creds.phoneNumberId ?? '', creds.accessToken ?? '', http);
    case 'telegram':
      return new TelegramSender(creds.botToken ?? '', http);
    case 'messenger':
      return new MetaMessagingSender('MESSENGER', creds.accessToken ?? '', http);
    case 'instagram':
      return new MetaMessagingSender('INSTAGRAM', creds.accessToken ?? '', http);
    case 'rcs-gateway':
      return new RcsSender(creds.apiUrl ?? '', creds.apiToken ?? '', http);
    default:
      return null;
  }
};
