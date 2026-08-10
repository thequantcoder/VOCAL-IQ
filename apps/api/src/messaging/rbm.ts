import { createSign } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type {
  RcsCard,
  RcsProvider,
  RcsSendResult,
  RcsSuggestion,
  RichMessage,
} from '@vocaliq/shared';

/**
 * Google RCS Business Messaging (RBM) provider (GME-12) — implements the `RcsProvider` seam so the
 * cascade engine (GME-11) can deliver rich content over RCS, with SMS/WhatsApp fallback when a number
 * isn't RCS-reachable. Auth is a Google service account: we mint a short-lived OAuth2 access token by
 * signing a JWT with the account's private key (RS256 via `node:crypto` — no googleapis SDK), exchange
 * it at the token endpoint, and cache it. HTTP + clock + uuid are injected so the whole thing is
 * unit-testable offline; the provider is only built when the tenant/platform has RBM creds (gated).
 *
 * Docs: https://developers.google.com/business-communications/rcs-business-messaging/reference/rest
 */

const RBM_BASE = 'https://rcsbusinessmessaging.googleapis.com/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const RBM_SCOPE = 'https://www.googleapis.com/auth/rcsbusinessmessaging';

/** A fetch-like transport that (unlike the SMS `HttpClient`) allows a body-less GET for capability. */
export type RbmHttp = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export const rbmFetch: RbmHttp = (url, init) =>
  fetch(url, {
    method: init.method,
    headers: init.headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
    signal: AbortSignal.timeout(8000),
  });

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Mints + caches a Google service-account OAuth2 access token. The JWT is signed RS256 with the
 * account's PEM private key and exchanged for a bearer token; the token is reused until shortly before
 * it expires. Clock + HTTP injected for deterministic tests.
 */
export class GoogleServiceAccountAuth {
  private cached: { token: string; expiresAt: number } | undefined;

  constructor(
    private readonly clientEmail: string,
    private readonly privateKey: string,
    private readonly http: RbmHttp = rbmFetch,
    private readonly scope: string = RBM_SCOPE,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getAccessToken(): Promise<string> {
    const skewMs = 60_000;
    if (this.cached && this.cached.expiresAt - skewMs > this.now()) return this.cached.token;

    const iat = Math.floor(this.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.clientEmail,
        scope: this.scope,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      }),
    );
    const signingInput = `${header}.${claims}`;
    // PEM keys copied through env often arrive with escaped newlines — restore them before signing.
    const pem = this.privateKey.includes('\\n')
      ? this.privateKey.replace(/\\n/g, '\n')
      : this.privateKey;
    const signature = base64url(createSign('RSA-SHA256').update(signingInput).sign(pem));
    const assertion = `${signingInput}.${signature}`;

    const res = await this.http(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`RBM token exchange ${res.status}: ${text.slice(0, 200)}`);
    const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('RBM token exchange returned no access_token');
    this.cached = {
      token: data.access_token,
      expiresAt: this.now() + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  }
}

// ── RichMessage → RBM AgentContentMessage mapping (pure) ──────────────────────

function toRbmSuggestion(s: RcsSuggestion): Record<string, unknown> {
  // RBM requires postbackData on every suggestion; default it to the visible label.
  const postbackData = s.postbackData ?? s.text;
  if (s.type === 'reply') return { reply: { text: s.text, postbackData } };
  const action: Record<string, unknown> = { text: s.text, postbackData };
  if (s.openUrl) action.openUrlAction = { url: s.openUrl };
  if (s.dialNumber) action.dialAction = { phoneNumber: s.dialNumber };
  return { action };
}

function toRbmCardContent(card: RcsCard): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  if (card.title) content.title = card.title;
  if (card.description) content.description = card.description;
  if (card.media) {
    content.media = {
      height: card.media.height,
      contentInfo: {
        fileUrl: card.media.fileUrl,
        ...(card.media.thumbnailUrl ? { thumbnailUrl: card.media.thumbnailUrl } : {}),
      },
    };
  }
  const suggestions = card.suggestions ?? [];
  if (suggestions.length > 0) content.suggestions = suggestions.map(toRbmSuggestion);
  return content;
}

/** Map a validated `RichMessage` to an RBM `contentMessage` payload (text / rich card / carousel / media). */
export function richMessageToRbm(msg: RichMessage): Record<string, unknown> {
  switch (msg.kind) {
    case 'text': {
      const content: Record<string, unknown> = { text: msg.text };
      const suggestions = msg.suggestions ?? [];
      if (suggestions.length > 0) content.suggestions = suggestions.map(toRbmSuggestion);
      return content;
    }
    case 'card':
      return {
        richCard: {
          standaloneCard: {
            cardOrientation: msg.orientation,
            cardContent: toRbmCardContent(msg.card),
          },
        },
      };
    case 'carousel':
      return {
        richCard: {
          carouselCard: {
            cardWidth: msg.cardWidth,
            cardContents: msg.cards.map(toRbmCardContent),
          },
        },
      };
    case 'media':
      return {
        contentInfo: {
          fileUrl: msg.media.fileUrl,
          ...(msg.media.thumbnailUrl ? { thumbnailUrl: msg.media.thumbnailUrl } : {}),
        },
      };
  }
}

// ── The RBM RcsProvider ───────────────────────────────────────────────────────

export class RbmRcsProvider implements RcsProvider {
  readonly id = 'google-rbm';

  constructor(
    private readonly agentId: string,
    private readonly auth: GoogleServiceAccountAuth,
    private readonly http: RbmHttp = rbmFetch,
    private readonly uuid: () => string = () => randomUUID(),
  ) {}

  private async authHeader(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.auth.getAccessToken()}` };
  }

  /** True iff the phone number is reachable over RCS for this agent (RBM 200); a 404 means not-capable. */
  async capabilityCheck(msisdn: string): Promise<boolean> {
    try {
      const url = `${RBM_BASE}/phones/${encodeURIComponent(msisdn)}/capabilities?agentId=${encodeURIComponent(this.agentId)}`;
      const res = await this.http(url, { method: 'GET', headers: await this.authHeader() });
      return res.ok;
    } catch {
      return false; // network/auth error → treat as not-capable so the cascade falls back
    }
  }

  async sendRich(msisdn: string, message: RichMessage): Promise<RcsSendResult> {
    try {
      const messageId = this.uuid(); // client-generated; RBM dedups on it, and it's our correlation id
      const url = `${RBM_BASE}/phones/${encodeURIComponent(msisdn)}/agentMessages?messageId=${encodeURIComponent(messageId)}&agentId=${encodeURIComponent(this.agentId)}`;
      const res = await this.http(url, {
        method: 'POST',
        headers: { ...(await this.authHeader()), 'content-type': 'application/json' },
        body: JSON.stringify({ contentMessage: richMessageToRbm(message) }),
      });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `RBM ${res.status}: ${text.slice(0, 200)}` };
      return { ok: true, providerMessageId: messageId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

/**
 * Build the RBM provider from env, gated: returns undefined unless the agent id + service-account
 * creds are all present, so the cascade simply skips RCS (falls back to SMS) until RBM is configured.
 */
export function buildRbmProvider(
  env: NodeJS.ProcessEnv,
  http: RbmHttp = rbmFetch,
): RbmRcsProvider | undefined {
  const agentId = env.GOOGLE_RBM_AGENT_ID;
  const clientEmail = env.GOOGLE_RBM_CLIENT_EMAIL;
  const privateKey = env.GOOGLE_RBM_PRIVATE_KEY;
  if (!agentId || !clientEmail || !privateKey) return undefined;
  return new RbmRcsProvider(
    agentId,
    new GoogleServiceAccountAuth(clientEmail, privateKey, http),
    http,
  );
}
