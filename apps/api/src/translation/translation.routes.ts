import { ValidationError } from '@vocaliq/shared';
import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import { requireRoles } from '../http/roles.middleware';
import { tenantMiddleware } from '../http/tenant.middleware';
import { CONFIG_WRITERS } from '../tenancy/roles';
import type { TenantService } from '../tenancy/tenant.service';
import type { TranslationService } from './translation.service';

/**
 * Real-time translation API (Day 88). The operator's working language + live captions + transcript
 * translation. Reads + caption/translate are any-member (operator tools; translation is metered);
 * changing the tenant working language is config-writer. Mounted at /translation.
 */
export function translationRoutes(svc: TranslationService, tenants: TenantService): Router {
  const r = Router();
  r.use(authMiddleware, tenantMiddleware(tenants));

  r.get(
    '/language',
    ah(async (req, res) => res.json(await svc.getOperatorLanguage(req.ctx!.tenantId))),
  );
  r.put(
    '/language',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => res.json(await svc.setOperatorLanguage(req.ctx!.tenantId, req.body))),
  );

  // Live caption — translate one utterance for the operator (cached + metered).
  r.post(
    '/caption',
    ah(async (req, res) => res.json(await svc.caption(req.ctx!.tenantId, req.body))),
  );

  // Translate a call's transcript into a target language (dual-language, stored). Config-writer +
  // segment-capped (it can drive many metered LLM calls — self-audit D).
  r.post(
    '/calls/:callId/translate',
    requireRoles(...CONFIG_WRITERS),
    ah(async (req, res) => {
      const lang = (req.body?.targetLanguage ?? req.query.lang) as string | undefined;
      if (!lang) throw new ValidationError('targetLanguage is required');
      res.json(await svc.translateTranscript(req.ctx!.tenantId, req.params.callId as string, lang));
    }),
  );
  r.get(
    '/calls/:callId/translation',
    ah(async (req, res) => {
      const lang = req.query.lang as string | undefined;
      if (!lang) throw new ValidationError('lang is required');
      res.json(
        await svc.getTranscriptTranslation(req.ctx!.tenantId, req.params.callId as string, lang),
      );
    }),
  );

  return r;
}
