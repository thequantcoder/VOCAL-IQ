import { z } from 'zod';

/**
 * BYO-SIP trunk templates + config (Day 35). Operators connect their own SIP trunk for
 * inbound/outbound AI calls; a template auto-fills the carrier's known defaults (host, port,
 * transport, whether REGISTER is required) so an operator only supplies credentials. Pure
 * data + helpers here (unit-tested); the API persists (creds encrypted, never returned) and
 * the voice service registers/routes the trunk (gated until a live trunk is attached).
 */

export const SIP_TRANSPORTS = ['TLS', 'TCP', 'UDP'] as const;
export type SipTransport = (typeof SIP_TRANSPORTS)[number];

export interface SipProviderTemplate {
  id: string;
  label: string;
  host: string; // carrier SIP host / gateway
  port: number;
  transport: SipTransport;
  /** Most carriers use IP/credential auth without REGISTER; some (Zadarma) require it. */
  registrationRequired: boolean;
  notes?: string;
}

/** 13 carrier templates + a generic custom trunk. Defaults are the carriers' documented SIP endpoints. */
export const SIP_PROVIDER_TEMPLATES: readonly SipProviderTemplate[] = [
  {
    id: 'twilio',
    label: 'Twilio Elastic SIP',
    host: 'YOUR_DOMAIN.pstn.twilio.com',
    port: 5061,
    transport: 'TLS',
    registrationRequired: false,
    notes: 'Create an Elastic SIP Trunk + a termination URI.',
  },
  {
    id: 'telnyx',
    label: 'Telnyx',
    host: 'sip.telnyx.com',
    port: 5061,
    transport: 'TLS',
    registrationRequired: false,
    notes: 'Credential or IP-based connection.',
  },
  {
    id: 'plivo',
    label: 'Plivo Zentrunk',
    host: 'YOUR_ZONE.zt.plivo.com',
    port: 5061,
    transport: 'TLS',
    registrationRequired: false,
  },
  {
    id: 'vonage',
    label: 'Vonage (Nexmo)',
    host: 'sip.nexmo.com',
    port: 5061,
    transport: 'TLS',
    registrationRequired: false,
  },
  {
    id: 'bandwidth',
    label: 'Bandwidth',
    host: 'YOUR.gw.bandwidth.com',
    port: 5060,
    transport: 'UDP',
    registrationRequired: false,
  },
  {
    id: 'exotel',
    label: 'Exotel',
    host: 'sip.exotel.com',
    port: 5060,
    transport: 'UDP',
    registrationRequired: false,
  },
  {
    id: 'didww',
    label: 'DIDWW',
    host: 'us.didww.com',
    port: 5060,
    transport: 'UDP',
    registrationRequired: false,
  },
  {
    id: 'zadarma',
    label: 'Zadarma',
    host: 'sip.zadarma.com',
    port: 5060,
    transport: 'UDP',
    registrationRequired: true,
    notes: 'Requires SIP REGISTER with your account login.',
  },
  {
    id: 'cloudonix',
    label: 'Cloudonix',
    host: 'sip.cloudonix.io',
    port: 5061,
    transport: 'TLS',
    registrationRequired: false,
  },
  {
    id: 'ringcentral',
    label: 'RingCentral',
    host: 'sip.ringcentral.com',
    port: 5061,
    transport: 'TLS',
    registrationRequired: true,
  },
  {
    id: 'sinch',
    label: 'Sinch',
    host: 'sip.sinch.com',
    port: 5061,
    transport: 'TLS',
    registrationRequired: false,
  },
  {
    id: 'infobip',
    label: 'Infobip',
    host: 'sip.infobip.com',
    port: 5061,
    transport: 'TLS',
    registrationRequired: false,
  },
  {
    id: 'signalwire',
    label: 'SignalWire',
    host: 'YOUR_SPACE.sip.signalwire.com',
    port: 5061,
    transport: 'TLS',
    registrationRequired: false,
  },
  {
    id: 'custom',
    label: 'Custom SIP trunk',
    host: '',
    port: 5060,
    transport: 'TLS',
    registrationRequired: false,
    notes: 'Enter your carrier’s SIP host, port, and transport.',
  },
] as const;

export function sipTemplate(id: string): SipProviderTemplate | undefined {
  return SIP_PROVIDER_TEMPLATES.find((t) => t.id === id);
}

// ── Create config ──────────────────────────────────────────────────────────────

export const sipCredentialsSchema = z.object({
  authUsername: z.string().min(1).max(120),
  authPassword: z.string().min(1).max(200),
  sipDomain: z.string().max(200).optional(),
});
export type SipCredentials = z.infer<typeof sipCredentialsSchema>;

export const sipTrunkCreateSchema = z.object({
  providerTemplate: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  host: z.string().max(200).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  transport: z.enum(SIP_TRANSPORTS).optional(),
  inbound: z.boolean().default(true),
  outbound: z.boolean().default(true),
  concurrencyLimit: z.number().int().min(1).max(1000).default(10),
  register: z.boolean().optional(),
  credentials: sipCredentialsSchema,
});
export type SipTrunkCreate = z.infer<typeof sipTrunkCreateSchema>;

export interface ResolvedSipConfig {
  providerTemplate: string;
  host: string;
  port: number;
  transport: SipTransport;
  registrationRequired: boolean;
}

/**
 * Resolve a create request against its template: caller overrides win, else the template's
 * carrier default fills in. Unknown template → treated as custom (caller must supply host).
 */
export function applyTemplate(input: SipTrunkCreate): ResolvedSipConfig {
  const tpl = sipTemplate(input.providerTemplate) ?? sipTemplate('custom');
  return {
    providerTemplate: input.providerTemplate,
    host: input.host?.trim() || tpl?.host || '',
    port: input.port ?? tpl?.port ?? 5060,
    transport: input.transport ?? tpl?.transport ?? 'TLS',
    registrationRequired: input.register ?? tpl?.registrationRequired ?? false,
  };
}

/** Mask a SIP username for read responses (creds are NEVER returned in full). */
export function maskSipUsername(username: string): string {
  if (username.length <= 2) return '••';
  return `${username.slice(0, 2)}${'•'.repeat(Math.max(3, username.length - 2))}`;
}
