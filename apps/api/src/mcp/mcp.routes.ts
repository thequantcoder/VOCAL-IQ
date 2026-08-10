import { ValidationError, mcpServerInputSchema } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { McpService } from './mcp.service';

const callSchema = z.object({
  tool: z.string().min(1).max(80),
  args: z.record(z.string(), z.unknown()).optional(),
});

/**
 * MCP / tool-server API (Day 46). Reads open to members; registration, discovery, and tool
 * calls are config-writer actions (they reach external systems + spend). RLS-scoped.
 */
export function mcpRoutes(mcp: McpService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/servers',
    ah(async (req, res) => {
      res.json(await mcp.list(req.ctx!.tenantId));
    }),
  );

  r.post(
    '/servers',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = mcpServerInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid server');
      res.status(201).json(await mcp.register(req.ctx!.tenantId, parsed.data));
    }),
  );

  r.delete(
    '/servers/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await mcp.remove(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/servers/:id/discover',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      res.json(await mcp.discover(req.ctx!.tenantId, req.params.id as string));
    }),
  );

  r.post(
    '/servers/:id/call',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const parsed = callSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError('A tool name is required');
      res.json(
        await mcp.callTool(
          req.ctx!.tenantId,
          req.params.id as string,
          parsed.data.tool,
          parsed.data.args ?? {},
        ),
      );
    }),
  );

  return r;
}
