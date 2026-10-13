import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import type { AppContext } from '../types.js';

/**
 * Test-support endpoints for the interview exercise. Only mounted when ENABLE_DEBUG_ROUTES=true.
 * They are unauthenticated on purpose so that reproduction scripts stay simple. Local use only.
 */
export function debugRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/boom', () => {
    throw new Error('simulated failure in debug route');
  });

  router.get(
    '/slow',
    asyncHandler(async (req, res) => {
      const ms = Math.min(Math.max(Number(req.query.ms ?? 1000) || 0, 0), 10_000);
      await new Promise((resolve) => setTimeout(resolve, ms));
      const { rows } = await ctx.pool.query('SELECT now() AS now');
      res.json({ ok: true, waitedMs: ms, dbTime: rows[0].now });
    }),
  );

  return router;
}
