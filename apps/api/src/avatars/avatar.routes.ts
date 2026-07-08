import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { AvatarService } from './avatar.service';

const secondsBody = z.object({ seconds: z.number().int().min(0).max(3600) });
const bindBody = z.object({ avatarId: z.string().uuid().nullable() });

/**
 * Digital-human / video-avatar API (Day 92). Catalogue CRUD + per-agent binding are config-writer
 * (they curate likeness assets); sessions are operational (any member — a session may auto-fall back
 * to voice). Mounted at /avatars.
 */
export function avatarRoutes(svc: AvatarService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  // ── catalogue ──
  r.get(
    '/',
    ah(async (req, res) => res.json(await svc.listAvatars(req.ctx!.tenantId))),
  );
  r.post(
    '/',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.status(201).json(await svc.createAvatar(req.ctx!.tenantId, req.body)),
    ),
  );
  r.put(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await svc.updateAvatar(req.ctx!.tenantId, req.params.id as string, req.body)),
    ),
  );
  r.delete(
    '/:id',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) =>
      res.json(await svc.deleteAvatar(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  // ── per-agent default avatar ──
  r.put(
    '/agents/:agentId',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const p = bindBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('avatarId (uuid|null) required');
      res.json(
        await svc.setAgentAvatar(req.ctx!.tenantId, req.params.agentId as string, p.data.avatarId),
      );
    }),
  );

  // ── sessions (video or auto-fallback to voice) ──
  r.post(
    '/sessions',
    ah(async (req, res) =>
      res.status(201).json(await svc.startSession(req.ctx!.tenantId, req.body)),
    ),
  );
  r.get(
    '/sessions',
    ah(async (req, res) => res.json(await svc.listSessions(req.ctx!.tenantId))),
  );
  r.get(
    '/sessions/:id',
    ah(async (req, res) =>
      res.json(await svc.getSession(req.ctx!.tenantId, req.params.id as string)),
    ),
  );
  r.post(
    '/sessions/:id/seconds',
    ah(async (req, res) => {
      const p = secondsBody.safeParse(req.body);
      if (!p.success) throw new ValidationError('seconds (int) required');
      res.json(await svc.addSeconds(req.ctx!.tenantId, req.params.id as string, p.data.seconds));
    }),
  );
  r.post(
    '/sessions/:id/end',
    ah(async (req, res) =>
      res.json(await svc.endSession(req.ctx!.tenantId, req.params.id as string)),
    ),
  );

  return r;
}
