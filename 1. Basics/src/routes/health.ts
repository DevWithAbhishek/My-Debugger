import { Router } from 'express';
import { asyncHandler } from '../errors/asyncHandler.js';
import type { AppContext } from '../types.js';

export function createHealth(ctx: AppContext): { router: Router; prime: () => Promise<void> } {
  const router = Router();

  // Remember the last successful database check so a busy readiness probe does not hammer postgres.
  let lastDbOkAt = 0;

  async function databaseReady(): Promise<boolean> {
    if (lastDbOkAt && Date.now() - lastDbOkAt < ctx.config.readinessCacheMs) return true;
    try {
      await ctx.pool.query('SELECT 1');
      lastDbOkAt = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  router.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get(
    '/readyz',
    asyncHandler(async (_req, res) => {
      const database = await databaseReady();
      const redis = ctx.redis.status !== 'end';
      const ready = database && redis;
      res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        checks: { database: database ? 'ok' : 'fail', redis: redis ? 'ok' : 'fail' },
      });
    }),
  );

  return {
    router,
    /** Called once at startup so the first readiness probe does not pay for the check. */
    prime: async () => {
      await ctx.pool.query('SELECT 1');
      lastDbOkAt = Date.now();
    },
  };
}
