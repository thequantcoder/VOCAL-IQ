import type { McpTool } from '@vocaliq/shared';

/**
 * MCP transport (Day 46) — the wire layer that talks JSON-RPC 2.0 to an external tool server
 * (`tools/list`, `tools/call`). Injected so the service is unit-testable offline (self-audit A)
 * and gated: with no server reachable the app still runs. The HTTP transport enforces the
 * per-server timeout and sends the (decrypted) auth header, which is never logged.
 */

export interface McpServerConn {
  url: string;
  transport: string;
  timeoutMs: number;
  authHeader?: string;
}

export interface McpTransport {
  listTools(server: McpServerConn): Promise<McpTool[]>;
  callTool(server: McpServerConn, name: string, args: Record<string, unknown>): Promise<string>;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

async function rpc(server: McpServerConn, method: string, params: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), server.timeoutMs);
  try {
    const res = await fetch(server.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(server.authHeader ? { authorization: server.authHeader } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`MCP server responded ${res.status}`);
    const data = (await res.json()) as JsonRpcResponse;
    if (data.error) throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Default JSON-RPC-over-HTTP transport. */
export const httpMcpTransport: McpTransport = {
  async listTools(server) {
    const result = (await rpc(server, 'tools/list', {})) as { tools?: RawTool[] } | undefined;
    return (result?.tools ?? []).map(normalizeTool);
  },
  async callTool(server, name, args) {
    const result = (await rpc(server, 'tools/call', { name, arguments: args })) as
      | { content?: { type?: string; text?: string }[] }
      | undefined;
    // MCP returns a content array; concatenate the text parts.
    return (result?.content ?? [])
      .map((c) => c.text ?? '')
      .filter(Boolean)
      .join('\n');
  },
};

interface RawTool {
  name?: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

/** Map an MCP tool descriptor (incl. its safety annotations) to our `McpTool`. */
function normalizeTool(t: RawTool): McpTool {
  return {
    name: t.name ?? 'unnamed',
    ...(t.description ? { description: t.description } : {}),
    ...(t.annotations?.readOnlyHint ? { readOnly: true } : {}),
    ...(t.annotations?.destructiveHint ? { destructive: true } : {}),
  };
}
