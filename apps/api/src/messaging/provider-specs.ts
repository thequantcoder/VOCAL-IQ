import type { MessageChannel } from '@vocaliq/shared';

/**
 * Messaging-provider credential specs (GME-01). Messaging providers need a SET of fields (e.g. Twilio
 * = accountSid + authToken + from; MSG91 = authkey + sender + DLT ids), not a single API key — so
 * unlike LLM/telephony keys (one secret in the `ProviderCredential` vault) they're stored as an
 * envelope-encrypted JSON blob keyed by the registry provider id. This spec drives: which fields a
 * provider requires, the platform-managed env fallback, and (GME-18) the config UI.
 */

/** One credential field a provider needs. `secret: true` → masked everywhere (token/secret). */
export interface MessagingCredField {
  key: string;
  label: string;
  secret: boolean;
}

export interface MessagingProviderSpec {
  /** Registry provider id — matches `MessageSender.id`. */
  id: string;
  label: string;
  channel: MessageChannel;
  fields: MessagingCredField[];
  /** field key → platform env var, for the managed-mode fallback when no vault row is set. */
  env: Record<string, string>;
}

export const MESSAGING_PROVIDER_SPECS: Record<string, MessagingProviderSpec> = {
  twilio: {
    id: 'twilio',
    label: 'Twilio SMS',
    channel: 'SMS',
    fields: [
      { key: 'accountSid', label: 'Account SID', secret: false },
      { key: 'authToken', label: 'Auth token', secret: true },
      { key: 'from', label: 'From number / messaging service SID', secret: false },
    ],
    env: {
      accountSid: 'TWILIO_ACCOUNT_SID',
      authToken: 'TWILIO_AUTH_TOKEN',
      from: 'TWILIO_MESSAGING_FROM',
    },
  },
  'whatsapp-cloud': {
    id: 'whatsapp-cloud',
    label: 'WhatsApp Cloud API',
    channel: 'WHATSAPP',
    fields: [
      { key: 'phoneNumberId', label: 'Phone number id', secret: false },
      { key: 'accessToken', label: 'Access token', secret: true },
    ],
    env: { phoneNumberId: 'WHATSAPP_PHONE_NUMBER_ID', accessToken: 'WHATSAPP_ACCESS_TOKEN' },
  },
  telegram: {
    id: 'telegram',
    label: 'Telegram Bot',
    channel: 'TELEGRAM',
    fields: [{ key: 'botToken', label: 'Bot token', secret: true }],
    env: { botToken: 'TELEGRAM_BOT_TOKEN' },
  },
  messenger: {
    id: 'messenger',
    label: 'Meta Messenger',
    channel: 'MESSENGER',
    fields: [{ key: 'accessToken', label: 'Page access token', secret: true }],
    env: { accessToken: 'MESSENGER_PAGE_ACCESS_TOKEN' },
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram DM',
    channel: 'INSTAGRAM',
    fields: [{ key: 'accessToken', label: 'Access token', secret: true }],
    env: { accessToken: 'INSTAGRAM_ACCESS_TOKEN' },
  },
  'rcs-gateway': {
    id: 'rcs-gateway',
    label: 'RCS gateway',
    channel: 'RCS',
    fields: [
      { key: 'apiUrl', label: 'Gateway URL', secret: false },
      { key: 'apiToken', label: 'API token', secret: true },
    ],
    env: { apiUrl: 'RCS_API_URL', apiToken: 'RCS_API_TOKEN' },
  },
};

export function messagingProviderSpec(providerId: string): MessagingProviderSpec | undefined {
  return MESSAGING_PROVIDER_SPECS[providerId];
}

/**
 * The default provider id for a channel (GME-02a) — today the single spec matching the channel.
 * The smart router (GME-03) supersedes this with per-tenant / per-country routing rules.
 */
export function defaultProviderForChannel(channel: MessageChannel): string | undefined {
  return Object.values(MESSAGING_PROVIDER_SPECS).find((s) => s.channel === channel)?.id;
}

/** The public (secret-free) provider catalogue for the config UI (GME-18). */
export function messagingProviderCatalogue(): Array<{
  id: string;
  label: string;
  channel: MessageChannel;
  fields: MessagingCredField[];
}> {
  return Object.values(MESSAGING_PROVIDER_SPECS).map(({ id, label, channel, fields }) => ({
    id,
    label,
    channel,
    fields,
  }));
}
