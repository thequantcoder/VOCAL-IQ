import { z } from 'zod';
import { IntegrationType } from './enums.js';

/**
 * Built-in integrations framework (Day 40). Native connectors sync a completed call to a
 * CRM/helpdesk: upsert the contact, push the lead's qualification + call sentiment/summary,
 * and open a ticket where configured. This module holds the PURE, provider-agnostic pieces:
 *  - the normalized `CallSyncPayload` a call maps to,
 *  - `mapCallToSync` that builds it from the tenant's own call/contact/lead/transcript,
 *  - `hubspotContactProps` that shapes the payload for the HubSpot API.
 * The api-side connectors do the authenticated HTTP; everything here is unit-tested.
 */

export const INTEGRATION_TYPES = Object.values(IntegrationType);

/** Which capabilities a connector supports — drives the UI + `syncCall` dispatch. */
export interface ConnectorCapabilities {
  contacts: boolean;
  tickets: boolean;
}

export const CONNECTOR_META: Record<
  IntegrationType,
  { label: string; capabilities: ConnectorCapabilities; implemented: boolean }
> = {
  HUBSPOT: { label: 'HubSpot', capabilities: { contacts: true, tickets: true }, implemented: true },
  SALESFORCE: {
    label: 'Salesforce',
    capabilities: { contacts: true, tickets: false },
    implemented: false,
  },
  ZENDESK: {
    label: 'Zendesk',
    capabilities: { contacts: true, tickets: true },
    implemented: false,
  },
  GOOGLE: {
    label: 'Google',
    capabilities: { contacts: false, tickets: false },
    implemented: false,
  },
  ZAPIER: { label: 'Zapier', capabilities: { contacts: true, tickets: false }, implemented: false },
  WEBHOOK: {
    label: 'Webhook',
    capabilities: { contacts: true, tickets: false },
    implemented: false,
  },
};

/** Normalized contact fields a connector upserts (provider-agnostic). */
export interface SyncContact {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

/** The provider-agnostic payload one completed call maps to. */
export interface CallSyncPayload {
  contact: SyncContact;
  leadStatus: string;
  leadScore: number;
  sentiment: string | null;
  summary: string | null;
  keywords: string[];
  /** A one-line note describing the call for a CRM timeline entry. */
  note: string;
  /** When true, the connector should open a support ticket for this call. */
  openTicket: boolean;
}

export interface CallSyncInput {
  contact: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    fields?: Record<string, unknown> | null;
  };
  lead?: { status?: string | null; score?: number | null } | null;
  transcript?: { summary?: string | null; sentiment?: string | null; keywords?: string[] } | null;
  /** Open a ticket when the call went badly (negative sentiment) or config forces it. */
  ticketOnNegative?: boolean;
}

/** Split a full name into first/last for CRMs that want them separate. */
export function splitName(name?: string | null): { firstName?: string; lastName?: string } {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return {};
  const [first, ...rest] = trimmed.split(/\s+/);
  const out: { firstName?: string; lastName?: string } = {};
  if (first) out.firstName = first;
  if (rest.length) out.lastName = rest.join(' ');
  return out;
}

/**
 * Map a completed call (its contact + lead + transcript) into the normalized sync payload.
 * Pure: no I/O. Missing pieces degrade gracefully (e.g. no lead → NEW/score 0).
 */
export function mapCallToSync(input: CallSyncInput): CallSyncPayload {
  const { firstName, lastName } = splitName(input.contact.name);
  const company = (input.contact.fields?.company ?? input.contact.fields?.Company) as
    | string
    | undefined;
  const sentiment = input.transcript?.sentiment ?? null;
  const summary = input.transcript?.summary ?? null;
  const leadStatus = input.lead?.status ?? 'NEW';
  const leadScore = input.lead?.score ?? 0;

  return {
    contact: {
      ...(input.contact.email ? { email: input.contact.email } : {}),
      ...(input.contact.phone ? { phone: input.contact.phone } : {}),
      ...(firstName ? { firstName } : {}),
      ...(lastName ? { lastName } : {}),
      ...(company ? { company } : {}),
    },
    leadStatus,
    leadScore,
    sentiment,
    summary,
    keywords: input.transcript?.keywords ?? [],
    note: buildNote(leadStatus, sentiment, summary),
    openTicket: Boolean(input.ticketOnNegative && sentiment === 'negative'),
  };
}

function buildNote(status: string, sentiment: string | null, summary: string | null): string {
  const head = `VocalIQ call — ${status.toLowerCase()}${sentiment ? ` · ${sentiment}` : ''}`;
  return summary ? `${head}: ${summary}` : head;
}

/** Shape the payload as HubSpot contact `properties` (flat string map). */
export function hubspotContactProps(p: CallSyncPayload): Record<string, string> {
  const props: Record<string, string> = {};
  if (p.contact.email) props.email = p.contact.email;
  if (p.contact.phone) props.phone = p.contact.phone;
  if (p.contact.firstName) props.firstname = p.contact.firstName;
  if (p.contact.lastName) props.lastname = p.contact.lastName;
  if (p.contact.company) props.company = p.contact.company;
  props.hs_lead_status = mapLeadStatusToHubspot(p.leadStatus);
  props.vocaliq_last_call = p.note.slice(0, 500);
  return props;
}

/** Map VocalIQ LeadStatus → HubSpot's `hs_lead_status` enum (best-effort). */
function mapLeadStatusToHubspot(status: string): string {
  switch (status) {
    case 'QUALIFIED':
    case 'HOT':
    case 'WARM':
      return 'OPEN_DEAL';
    case 'CONTACTED':
    case 'BOOKED':
      return 'IN_PROGRESS';
    case 'LOST':
    case 'COLD':
      return 'UNQUALIFIED';
    default:
      return 'NEW';
  }
}

// ── Config validation ─────────────────────────────────────────────────────────

/** Connect payload: the tenant supplies their own connector credential (BYO). */
export const integrationConnectSchema = z.object({
  type: z.enum(INTEGRATION_TYPES as [IntegrationType, ...IntegrationType[]]),
  /** e.g. a HubSpot private-app token, a Zendesk API token, etc. */
  accessToken: z.string().min(8).max(400),
  /** Optional non-secret settings, e.g. Zendesk subdomain. */
  settings: z.record(z.string(), z.string().max(200)).optional(),
  /** Open a helpdesk ticket automatically when a call ends negative. */
  ticketOnNegative: z.boolean().default(false),
});
export type IntegrationConnect = z.infer<typeof integrationConnectSchema>;
