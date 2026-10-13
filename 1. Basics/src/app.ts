import express, { type Express } from 'express';
import { createErrorHandler, notFoundHandler } from './errors/handler.js';
import { accessLog } from './middleware/accessLog.js';
import { requestId } from './middleware/requestId.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { debugRouter } from './routes/debug.js';
import { createHealth } from './routes/health.js';
import { incidentsRouter } from './routes/incidents.js';
import { legacyRouter } from './routes/legacy.js';
import { reportsRouter } from './routes/reports.js';
import { createAdminService } from './services/adminService.js';
import { createIncidentService } from './services/incidentService.js';
import { createSessionService } from './services/sessionService.js';
import type { AppContext } from './types.js';

export interface CreatedApp {
  app: Express;
  /** Warm up dependency state. Called by server.ts after listening. */
  prime: () => Promise<void>;
}

export function createApp(ctx: AppContext): CreatedApp {
  const app = express();
  app.disable('x-powered-by');

  const incidents = createIncidentService(ctx);
  const admin = createAdminService(ctx);
  const sessions = createSessionService(ctx);
  const health = createHealth(ctx);

  // Old dashboard routes are mounted first so they bypass the newer middleware stack.
  app.use('/api/v1/legacy', legacyRouter(incidents));

  app.use(requestId());
  app.use(accessLog(ctx.logger));
  app.use(express.json({ limit: '100kb' }));

  app.use(health.router);
  app.use('/api/v1/auth', authRouter(ctx, sessions));
  app.use('/api/v1/incidents', incidentsRouter(ctx, incidents));
  app.use('/api/v1/admin', reportsRouter(ctx, admin));
  app.use('/api/v1/admin', adminRouter(ctx, admin));
  if (ctx.config.enableDebugRoutes) {
    app.use('/api/v1/debug', debugRouter(ctx));
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(ctx.config, ctx.logger));

  return { app, prime: health.prime };
}
