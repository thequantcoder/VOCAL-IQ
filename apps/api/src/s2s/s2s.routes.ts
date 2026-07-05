import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import type { TenantService } from '../tenancy/tenant.service';
import type { S2SService } from './s2s.service';

/**
 * Speech-to-speech mode API (Day 65). Returns whether an agent's active flow can use direct
 * audio-to-audio (lower latency) or the STT→LLM→TTS pipeline. The voice service calls this when
 * starting a call. Mounted at /agents/:agentId/s2s, session-authed + tenant-scoped.
 */
export function s2sRoutes(s2s: S2SService, tenants: TenantService): Router {
  const r = Router({ mergeParams: true });
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/',
    ah(async (req, res) => {
      const agentId = (req.params as { agentId: string }).agentId;
      res.json(await s2s.resolveMode(req.ctx!.tenantId, agentId));
    }),
  );

  return r;
}
