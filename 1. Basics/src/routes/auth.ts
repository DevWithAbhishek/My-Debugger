import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../errors/asyncHandler.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { Errors } from '../errors/AppError.js';
import type { SessionService } from '../services/sessionService.js';
import type { AppContext } from '../types.js';

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const RefreshBody = z.object({ refreshToken: z.string().min(20) });

export function authRouter(ctx: AppContext, sessions: SessionService): Router {
  const router = Router();

  router.post(
    '/login',
    validateBody(LoginBody),
    asyncHandler(async (req, res) => {
      res.json(await sessions.login(req.body.email, req.body.password));
    }),
  );

  router.post(
    '/refresh',
    validateBody(RefreshBody),
    asyncHandler(async (req, res) => {
      res.json(await sessions.refresh(req.body.refreshToken));
    }),
  );

  router.post(
    '/logout',
    authenticate(ctx),
    asyncHandler(async (req, res) => {
      await sessions.logout(req.auth!.sid);
      res.status(204).end();
    }),
  );

  router.get(
    '/me',
    authenticate(ctx),
    asyncHandler(async (req, res) => {
      const { rows } = await ctx.pool.query(
        `SELECT u.id, u.email, u.name, u.role, u.team_id AS "teamId", u.status, t.name AS "teamName", t.active AS "teamActive"
         FROM users u LEFT JOIN teams t ON t.id = u.team_id WHERE u.id = $1`,
        [req.auth!.userId],
      );
      if (!rows[0]) throw Errors.unauthenticated();
      res.json(rows[0]);
    }),
  );

  return router;
}
