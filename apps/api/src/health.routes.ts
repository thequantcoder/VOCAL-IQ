import { type Request, type Response, Router } from 'express';

/** Liveness probe used by local dev, CI, and orchestrators (PM2/Nginx). */
export function healthRoutes(): Router {
  const r = Router();
  r.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'api' });
  });
  return r;
}
