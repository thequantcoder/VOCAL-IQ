/**
 * @vocaliq/sdk — the official TypeScript client for the VocalIQ public API (Day 48). A thin,
 * dependency-free wrapper over `fetch` that attaches your API key and types the v1 endpoints.
 * The `fetch` implementation is injectable so the client is testable + runtime-agnostic (Node
 * 18+, Deno, browsers, edge). Other languages get generated stubs from `/v1/openapi.json`.
 *
 * @example
 * const vq = new VocalIQClient({ apiKey: process.env.VOCALIQ_API_KEY! });
 * const agents = await vq.agents.list();
 */

export interface VocalIQClientOptions {
  apiKey: string;
  /** Base URL of the VocalIQ deployment (default: https://api.vocaliq.dev). */
  baseUrl?: string;
  /** Injectable fetch (defaults to the global). */
  fetch?: typeof fetch;
}

export class VocalIQError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VocalIQError';
  }
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
  languages: string[];
  updatedAt: string;
}

export interface WhoAmI {
  tenantId: string;
  scopes: string[];
}

export class VocalIQClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(opts: VocalIQClientOptions) {
    if (!opts.apiKey) throw new Error('apiKey is required');
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.vocaliq.dev').replace(/\/$/, '');
    const f = opts.fetch ?? globalThis.fetch;
    if (!f) throw new Error('No fetch implementation available; pass one via options.fetch');
    this.doFetch = f;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message =
        (data && (data.error?.message || data.message)) || `Request failed (${res.status})`;
      throw new VocalIQError(message, res.status);
    }
    return data as T;
  }

  /** Identify the calling API key (tenant + scopes). */
  whoami(): Promise<WhoAmI> {
    return this.request<WhoAmI>('GET', '/v1/whoami');
  }

  readonly agents = {
    list: (): Promise<Agent[]> => this.request<Agent[]>('GET', '/v1/agents'),
  };

  readonly calls = {
    list: (): Promise<{ items: unknown[]; nextCursor: string | null }> =>
      this.request('GET', '/v1/calls'),
    create: (input: { agentId: string; to: string; consentBasis: string }): Promise<unknown> =>
      this.request('POST', '/v1/calls', input),
  };

  readonly leads = {
    list: (): Promise<unknown[]> => this.request<unknown[]>('GET', '/v1/leads'),
  };
}
