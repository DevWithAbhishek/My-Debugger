import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { validateBody } from '../middleware/validate.js';
import type { AdminService } from '../services/adminService.js';
import type { AppContext } from '../types.js';

const IdParam = z.string().uuid();
const PatchUserBody = z
  .object({
    role: z.enum(['viewer', 'responder', 'admin']).optional(),
    teamId: z.string().uuid().nullable().optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict();

export function adminRouter(ctx: AppContext, admin: AdminService): Router {
  const router = Router();
  router.use(authenticate(ctx), requireRole('admin'));

  router.get(
    '/users',
    asyncHandler(async (_req, res) => {
      res.json({ items: await admin.listUsers() });
    }),
  );

  router.patch(
    '/users/:id',
    validateBody(PatchUserBody),
    asyncHandler(async (req, res) => {
      res.json(await admin.updateUser(IdParam.parse(req.params.id), req.body));
    }),
  );

  router.post(
    '/teams/:id/deactivate',
    asyncHandler(async (req, res) => {
      res.json(await admin.setTeamActive(IdParam.parse(req.params.id), false));
    }),
  );

  router.post(
    '/teams/:id/activate',
    asyncHandler(async (req, res) => {
      res.json(await admin.setTeamActive(IdParam.parse(req.params.id), true));
    }),
  );

  return router;
}
