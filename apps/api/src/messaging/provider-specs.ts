import { type MessageChannel, Provider } from '@vocaliq/shared';

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
  msg91: {
    id: 'msg91',
    label: 'MSG91 SMS (India)',
    channel: 'SMS',
    fields: [
      { key: 'authKey', label: 'Auth key', secret: true },
      { key: 'sender', label: 'DLT sender header (6 chars)', secret: false },
      { key: 'flowId', label: 'DLT flow / template id', secret: false },
    ],
    env: { authKey: 'MSG91_AUTHKEY', sender: 'MSG91_SENDER', flowId: 'MSG91_FLOW_ID' },
  },
  gupshup: {
    id: 'gupshup',
    label: 'Gupshup SMS (India)',
    channel: 'SMS',
    fields: [
      { key: 'userId', label: 'User id', secret: false },
      { key: 'password', label: 'Password', secret: true },
      { key: 'sender', label: 'DLT sender header (mask)', secret: false },
    ],
    env: { userId: 'GUPSHUP_USERID', password: 'GUPSHUP_PASSWORD', sender: 'GUPSHUP_SENDER' },
  },
  vonage: {
    id: 'vonage',
    label: 'Vonage (Nexmo) SMS',
    channel: 'SMS',
    fields: [
      { key: 'apiKey', label: 'API key', secret: false },
      { key: 'apiSecret', label: 'API secret', secret: true },
      { key: 'from', label: 'Sender id / number', secret: false },
    ],
    env: { apiKey: 'VONAGE_API_KEY', apiSecret: 'VONAGE_API_SECRET', from: 'VONAGE_FROM' },
  },
  plivo: {
    id: 'plivo',
    label: 'Plivo SMS',
    channel: 'SMS',
    fields: [
      { key: 'authId', label: 'Auth id', secret: false },
      { key: 'authToken', label: 'Auth token', secret: true },
      { key: 'from', label: 'From number', secret: false },
    ],
    // Reuses the same Plivo carrier credentials the telephony side uses.
    env: { authId: 'PLIVO_AUTH_ID', authToken: 'PLIVO_AUTH_TOKEN', from: 'PLIVO_FROM' },
  },
  telnyx: {
    id: 'telnyx',
    label: 'Telnyx SMS',
    channel: 'SMS',
    fields: [
      { key: 'apiKey', label: 'API key', secret: true },
      { key: 'from', label: 'From number', secret: false },
    ],
    // Reuses the same Telnyx API key the telephony side uses.
    env: { apiKey: 'TELNYX_API_KEY', from: 'TELNYX_FROM' },
  },
  sinch: {
    id: 'sinch',
    label: 'Sinch SMS',
    channel: 'SMS',
    fields: [
      { key: 'servicePlanId', label: 'Service plan id', secret: false },
      { key: 'token', label: 'API token', secret: true },
      { key: 'from', label: 'From number', secret: false },
    ],
    env: { servicePlanId: 'SINCH_SERVICE_PLAN_ID', token: 'SINCH_TOKEN', from: 'SINCH_FROM' },
  },
  messagebird: {
    id: 'messagebird',
    label: 'MessageBird (Bird) SMS',
    channel: 'SMS',
    fields: [
      { key: 'accessKey', label: 'Access key', secret: true },
      { key: 'from', label: 'Originator (sender id/number)', secret: false },
    ],
    env: { accessKey: 'MESSAGEBIRD_ACCESS_KEY', from: 'MESSAGEBIRD_FROM' },
  },
  infobip: {
    id: 'infobip',
    label: 'Infobip SMS',
    channel: 'SMS',
    fields: [
      { key: 'baseUrl', label: 'Base URL (xxxxx.api.infobip.com)', secret: false },
      { key: 'apiKey', label: 'API key', secret: true },
      { key: 'from', label: 'Sender id/number', secret: false },
    ],
    env: { baseUrl: 'INFOBIP_BASE_URL', apiKey: 'INFOBIP_API_KEY', from: 'INFOBIP_FROM' },
  },
  'aws-sns': {
    id: 'aws-sns',
    label: 'Amazon SNS SMS',
    channel: 'SMS',
    fields: [
      { key: 'accessKeyId', label: 'AWS access key id', secret: false },
      { key: 'secretAccessKey', label: 'AWS secret access key', secret: true },
      { key: 'region', label: 'AWS region (e.g. us-east-1)', secret: false },
    ],
    env: {
      accessKeyId: 'AWS_SNS_ACCESS_KEY_ID',
      secretAccessKey: 'AWS_SNS_SECRET_ACCESS_KEY',
      region: 'AWS_SNS_REGION',
    },
  },
  bandwidth: {
    id: 'bandwidth',
    label: 'Bandwidth SMS',
    channel: 'SMS',
    fields: [
      { key: 'accountId', label: 'Account id', secret: false },
      { key: 'applicationId', label: 'Messaging application id', secret: false },
      { key: 'username', label: 'API username', secret: false },
      { key: 'password', label: 'API password', secret: true },
      { key: 'from', label: 'From number', secret: false },
    ],
    env: {
      accountId: 'BANDWIDTH_ACCOUNT_ID',
      applicationId: 'BANDWIDTH_APPLICATION_ID',
      username: 'BANDWIDTH_USERNAME',
      password: 'BANDWIDTH_PASSWORD',
      from: 'BANDWIDTH_FROM',
    },
  },
  clicksend: {
    id: 'clicksend',
    label: 'ClickSend SMS',
    channel: 'SMS',
    fields: [
      { key: 'username', label: 'Username', secret: false },
      { key: 'apiKey', label: 'API key', secret: true },
      { key: 'from', label: 'Sender id / number', secret: false },
    ],
    env: { username: 'CLICKSEND_USERNAME', apiKey: 'CLICKSEND_API_KEY', from: 'CLICKSEND_FROM' },
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

/** The billing `Provider` enum for a registry provider id (GME-04) — for UsageRecord attribution. */
const PROVIDER_ENUM: Record<string, Provider> = {
  twilio: Provider.TWILIO,
  msg91: Provider.MSG91,
  gupshup: Provider.GUPSHUP,
  vonage: Provider.VONAGE,
  plivo: Provider.PLIVO,
  telnyx: Provider.TELNYX,
  sinch: Provider.SINCH,
  messagebird: Provider.MESSAGEBIRD,
  infobip: Provider.INFOBIP,
  'aws-sns': Provider.AWS_SNS,
  bandwidth: Provider.BANDWIDTH,
  clicksend: Provider.CLICKSEND,
  'whatsapp-cloud': Provider.WHATSAPP,
  telegram: Provider.TELEGRAM,
  messenger: Provider.MESSENGER,
  instagram: Provider.INSTAGRAM,
  'rcs-gateway': Provider.RCS,
};

export function messagingProviderEnum(providerId: string): Provider | undefined {
  return PROVIDER_ENUM[providerId];
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
