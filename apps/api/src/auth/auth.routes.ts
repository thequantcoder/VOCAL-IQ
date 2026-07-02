import { Router } from 'express';
import { ah } from '../http/async-handler';
import { authMiddleware } from '../http/auth.middleware';
import type { AuthService } from './auth.service';

/** Self-hosted auth routes: register + login (public) and me (JWT-protected). */
export function authRoutes(auth: AuthService): Router {
  const r = Router();

  r.post(
    '/register',
    ah(async (req, res) => {
      res.json(await auth.register(req.body));
    }),
  );

  r.post(
    '/login',
    ah(async (req, res) => {
      res.json(await auth.login(req.body));
    }),
  );

  r.get(
    '/me',
    authMiddleware,
    ah(async (req, res) => {
      res.json(await auth.me(req.auth!.userId));
    }),
  );

  return r;
}
