import {
  ForbiddenError,
  type McpServerInput,
  type McpTool,
  NotFoundError,
  type TrustContext,
  ValidationError,
  allowedTools,
  checkPublicHttpUrl,
  clampToolTimeout,
  trustAllowsTool,
  vetToolOutput,
} from '@vocaliq/shared';
import type { PrismaService } from '../db/prisma.service';
import type { McpServerConn, McpTransport } from './transport';

/**
 * MCP / external tool-server service (Day 46). Register untrusted tool servers per tenant/agent,
 * discover their tools, and call them SAFELY: every URL is SSRF-guarded on registration, tool
 * ACCESS is gated by the server's trust context (fail-closed for low/unknown), the response is
 * bounded by a clamped per-server timeout, OUTPUT is vetted as untrusted data, and every call
 * is written to the audit log. All reads/writes are RLS-scoped (self-audit B + C). The
 * transport + clock are injected so the service is unit-tested offline.
 */

// KMS envelope encryption lands Day 57; until then the auth header is base64-obscured (never
// returned to a client, never logged) — mirrors the Day-40 integration token handling.
const seal = (v: string) => Buffer.from(v, 'utf8').toString('base64');
const unseal = (v: string) => Buffer.from(v, 'base64').toString('utf8');

export interface McpServerRow {
  id: string;
  name: string;
  url: string;
  transport: string;
  trustContext: TrustContext;
  timeoutMs: number;
  agentId: string | null;
  active: boolean;
  tools: McpTool[];
  hasAuth: boolean;
  updatedAt: Date;
}

export interface ToolCallResult {
  tool: string;
  trusted: boolean;
  output: string;
  durationMs: number;
}

export class McpService {
  constructor(
    private readonly db: PrismaService,
    private readonly transport: McpTransport,
    private readonly now: () => number = () => Date.now(),
  ) {}

  // ── Registration ──────────────────────────────────────────────────────────────

  async register(tenantId: string, input: McpServerInput): Promise<McpServerRow> {
    const check = checkPublicHttpUrl(input.url);
    if (!check.ok) throw new ValidationError(`Unsafe MCP server URL: ${check.reason}`);

    const row = await this.db.withTenant(tenantId, (tx) =>
      tx.mcpServer.create({
        data: {
          tenantId,
          name: input.name,
          url: input.url,
          transport: input.transport,
          trustContext: input.trustContext,
          timeoutMs: clampToolTimeout(input.timeoutMs),
          active: input.active,
          ...(input.agentId ? { agentId: input.agentId } : {}),
          ...(input.authHeader ? { authHeaderCipher: seal(input.authHeader) } : {}),
        },
        select: SELECT_SERVER,
      }),
    );
    return toRow(row);
  }

  async list(tenantId: string): Promise<McpServerRow[]> {
    const rows = await this.db.withTenant(tenantId, (tx) =>
      tx.mcpServer.findMany({ orderBy: { createdAt: 'desc' }, select: SELECT_SERVER }),
    );
    return rows.map(toRow);
  }

  async remove(tenantId: string, id: string): Promise<{ deleted: true }> {
    const existing = await this.db.withTenant(tenantId, (tx) =>
      tx.mcpServer.findFirst({ where: { id }, select: { id: true } }),
    );
    if (!existing) throw new NotFoundError('MCP server not found');
    await this.db.withTenant(tenantId, (tx) => tx.mcpServer.delete({ where: { id } }));
    return { deleted: true };
  }

  // ── Discovery ─────────────────────────────────────────────────────────────────

  /** Connect to the server, list its tools, persist them, and return them. */
  async discover(tenantId: string, id: string): Promise<McpTool[]> {
    const server = await this.load(tenantId, id);
    const tools = await this.transport.listTools(this.conn(server));
    await this.db.withTenant(tenantId, (tx) =>
      tx.mcpServer.update({
        where: { id },
        data: { tools: tools as unknown as object },
      }),
    );
    await this.audit(tenantId, 'mcp.discover', server.name, {
      serverId: id,
      toolCount: tools.length,
    });
    return tools;
  }

  // ── Tool call (gated + audited) ────────────────────────────────────────────────

  /**
   * Call one tool on a server. Denies (403) if the server's trust context doesn't permit the
   * tool; enforces the per-server timeout; vets the output as untrusted data; audits the call.
   */
  async callTool(
    tenantId: string,
    id: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<ToolCallResult> {
    const server = await this.load(tenantId, id);
    if (!server.active) throw new ValidationError('MCP server is not active');
    const trust = server.trustContext as TrustContext;

    const tool = (server.tools as unknown as McpTool[]).find((t) => t.name === toolName);
    if (!tool) throw new NotFoundError('Tool not found (run discovery first)');
    if (!trustAllowsTool(trust, tool)) {
      await this.audit(tenantId, 'mcp.tool_call.denied', toolName, { serverId: id, trust });
      throw new ForbiddenError(
        `Tool "${toolName}" is not permitted at trust context ${trust} (only read-only tools are exposed from untrusted servers)`,
      );
    }

    const started = this.now();
    let status = 'ok';
    let raw = '';
    try {
      raw = await this.transport.callTool(this.conn(server), toolName, args);
    } catch (err) {
      status = 'error';
      await this.audit(tenantId, 'mcp.tool_call', toolName, {
        serverId: id,
        trust,
        status,
        durationMs: this.now() - started,
      });
      throw new ValidationError(`Tool call failed: ${(err as Error).message}`);
    }

    const durationMs = this.now() - started;
    const vetted = vetToolOutput(trust, raw);
    await this.audit(tenantId, 'mcp.tool_call', toolName, {
      serverId: id,
      trust,
      status,
      durationMs,
    });
    return { tool: toolName, trusted: vetted.trusted, output: vetted.text, durationMs };
  }

  /** The trust-filtered tool descriptors to expose to the LLM loop for an agent. */
  async toolsForAgent(tenantId: string, agentId: string): Promise<McpTool[]> {
    const servers = await this.db.withTenant(tenantId, (tx) =>
      tx.mcpServer.findMany({
        where: { active: true, OR: [{ agentId: null }, { agentId }] },
        select: { trustContext: true, tools: true },
      }),
    );
    const out: McpTool[] = [];
    for (const s of servers) {
      const tools = (Array.isArray(s.tools) ? s.tools : []) as unknown as McpTool[];
      out.push(...allowedTools(s.trustContext as TrustContext, tools));
    }
    return out;
  }

  // ── internals ──────────────────────────────────────────────────────────────────

  private async load(tenantId: string, id: string) {
    const server = await this.db.withTenant(tenantId, (tx) =>
      tx.mcpServer.findFirst({
        where: { id },
        select: {
          id: true,
          name: true,
          url: true,
          transport: true,
          trustContext: true,
          timeoutMs: true,
          authHeaderCipher: true,
          tools: true,
          active: true,
        },
      }),
    );
    if (!server) throw new NotFoundError('MCP server not found');
    return server;
  }

  private conn(server: {
    url: string;
    transport: string;
    timeoutMs: number;
    authHeaderCipher: string | null;
  }): McpServerConn {
    return {
      url: server.url,
      transport: server.transport,
      timeoutMs: clampToolTimeout(server.timeoutMs),
      ...(server.authHeaderCipher ? { authHeader: unseal(server.authHeaderCipher) } : {}),
    };
  }

  private async audit(
    tenantId: string,
    action: string,
    target: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.db.withTenant(tenantId, (tx) =>
      tx.auditLog.create({ data: { tenantId, action, target, meta: meta as object } }),
    );
  }
}

const SELECT_SERVER = {
  id: true,
  name: true,
  url: true,
  transport: true,
  trustContext: true,
  timeoutMs: true,
  agentId: true,
  active: true,
  tools: true,
  authHeaderCipher: true,
  updatedAt: true,
} as const;

function toRow(r: {
  id: string;
  name: string;
  url: string;
  transport: string;
  trustContext: string;
  timeoutMs: number;
  agentId: string | null;
  active: boolean;
  tools: unknown;
  authHeaderCipher: string | null;
  updatedAt: Date;
}): McpServerRow {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    transport: r.transport,
    trustContext: r.trustContext as TrustContext,
    timeoutMs: r.timeoutMs,
    agentId: r.agentId,
    active: r.active,
    tools: (Array.isArray(r.tools) ? r.tools : []) as McpTool[],
    hasAuth: Boolean(r.authHeaderCipher), // never leak the sealed value
    updatedAt: r.updatedAt,
  };
}
