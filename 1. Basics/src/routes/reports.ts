import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import type { AdminService } from '../services/adminService.js';
import type { AppContext } from '../types.js';

/** Read-only reporting endpoints added for the ops dashboard. */
export function reportsRouter(ctx: AppContext, admin: AdminService): Router {
  const router = Router();

  router.get(
    '/reports/summary',
    authenticate(ctx),
    asyncHandler(async (_req, res) => {
      res.json({ generatedAt: new Date().toISOString(), teams: await admin.summary() });
    }),
  );

  return router;
}
